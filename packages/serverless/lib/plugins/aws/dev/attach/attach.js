/**
 * One UpdateFunctionConfiguration per function, always with the RevisionId read just before it,
 * layers and environment in the same call. A 412 (someone changed the function) or 409 (an
 * update is in progress) re-reads the function and re-derives the change, so a teammate's or a
 * tool's edit is never overwritten with a stale configuration. A function whose variables cannot
 * be read is never written: an environment derived from them would delete them all.
 */
import pLimit from 'p-limit'
import {
  credentialsInvalidError,
  isAccessDenied,
  isCredentialError,
  sleep as defaultSleep,
  waitForUpdate,
} from './aws.js'
import { ENV, EXEC_WRAPPER, WRAPPER_PATH, isDevModeLayerArn } from './naming.js'
import {
  ENV_UNREADABLE_WHY,
  attachLayers,
  buildRestoreVariables,
  detachLayers,
  isAttached,
  isEnvUnreadable,
  layerArnsOf,
  readAttachment,
  variablesOf,
} from './undo-record.js'

/** Lambda control-plane calls share 15 requests per second per account and region. */
export const CONTROL_PLANE_PARALLELISM = 10

const MAX_RACES = 4
const STALE_REVISION = 'PreconditionFailedException'
const UPDATE_IN_PROGRESS = 'ResourceConflictException'
const RACES = new Set([STALE_REVISION, UPDATE_IN_PROGRESS])

const REJECTIONS = [
  [
    /Cannot reference more than 5 layers/,
    'no_free_layer_slot',
    'already uses 5 layers',
  ],
  // "Layers consume more than the available size of 262144000 bytes" and "Function code
  // combined with layers exceeds the maximum allowed size of 262144000 bytes".
  [
    /262144000/,
    'package_too_large',
    'code and layers would exceed the 250 MB unzipped limit',
  ],
  [
    /exceeded the 4KB limit/,
    'env_too_large',
    'its environment variables would exceed the 4 KB limit',
  ],
]
const CODE_SIGNING_ERRORS = new Set([
  'CodeVerificationFailedException',
  'InvalidCodeSignatureException',
])

/** Limits Lambda enforces on the update itself; nothing changes when it rejects one. */
export const mapAttachRejection = (error) => {
  if (CODE_SIGNING_ERRORS.has(error?.name)) {
    return {
      reason: 'code_signing_enforced',
      why: 'code signing is enforced and the Dev Mode layer is not signed',
    }
  }
  if (error?.name !== 'InvalidParameterValueException') return null
  const match = REJECTIONS.find(([pattern]) =>
    pattern.test(error.message ?? ''),
  )
  return match ? { reason: match[1], why: match[2] } : null
}

const SECRET_VARIABLES = [ENV.SESSION_KEY, ENV.BROKER_EXTERNAL_ID]
export const REDACTED = '<redacted>'

/** Adds the secret values among `variables` to `secrets`. */
const collectSecrets = (secrets, variables) => {
  for (const name of SECRET_VARIABLES) {
    const value = variables?.[name]
    // Dev Mode writes 32-character ids and 44-character keys; a shorter value is not one of them.
    if (typeof value === 'string' && value.length >= 16) secrets.add(value)
  }
}

export const redactSecrets = (text, secrets) => {
  let redacted = text
  for (const secret of secrets) redacted = redacted.split(secret).join(REDACTED)
  return redacted
}

/**
 * AWS errors can echo a function's environment (Lambda's 4 KB refusal prints it whole), so the
 * session key and the ExternalId that `run` read or wrote are cut out of the message of its
 * outcome or its error, whatever the wording.
 */
const withoutSecrets = async (run) => {
  const secrets = new Set()
  const clean = (text) =>
    typeof text === 'string' ? redactSecrets(text, secrets) : text
  try {
    const outcome = await run(secrets)
    return outcome?.message === undefined
      ? outcome
      : { ...outcome, message: clean(outcome.message) }
  } catch (error) {
    if (error && typeof error === 'object') {
      for (const field of ['message', 'originalMessage', 'stack']) {
        if (typeof error[field] === 'string') error[field] = clean(error[field])
      }
    }
    throw error
  }
}

/** Expired or invalid credentials fail every function alike, so they stop the run. */
const rethrow = (error) => {
  if (isCredentialError(error)) throw credentialsInvalidError(error)
  throw error
}

/** The function once it is created and no update is being applied to it. */
const readSettled = async ({ lambda, name, sleep, now }) => {
  try {
    const live = await lambda.getFunction(name)
    return live?.LastUpdateStatus === 'InProgress' || live?.State === 'Pending'
      ? await waitForUpdate({ lambda, name, sleep, now })
      : live
  } catch (error) {
    return rethrow(error)
  }
}

/** A 409 means another update is still being applied: give it a jittered moment first. */
const afterRace = async ({ error, race, sleep, random }) => {
  if (error.name !== UPDATE_IN_PROGRESS || race + 1 >= MAX_RACES) return
  await sleep(Math.min(4000, 250 * 2 ** race) + Math.floor(random() * 250))
}

const gaveUp = (lastRace, doing) => ({
  status: 'failed',
  message:
    lastRace === UPDATE_IN_PROGRESS
      ? `another update to it was still in progress while Dev Mode ${doing} (tried ${MAX_RACES} times)`
      : `its configuration kept changing while Dev Mode ${doing} (tried ${MAX_RACES} times)`,
})

const settledOutcome = async ({ lambda, name, sleep, now }) => {
  const settled = await readSettled({ lambda, name, sleep, now })
  if (settled?.LastUpdateStatus === 'Failed') {
    return {
      status: 'failed',
      message:
        settled.LastUpdateStatusReason ?? 'the configuration update failed',
    }
  }
  return null
}

/**
 * Attaches Dev Mode to one function. `prepare(live)` (sync or async) derives the variables (and
 * optionally `layerArn` and `row`) from the configuration read just before each write (or returns
 * `{ skip: row }`), so a retry after a race re-derives
 * from what is live then. No outcome or error message carries the session key or the ExternalId.
 */
export const attachFunction = (options) =>
  withoutSecrets((secrets) => attachWith(options, secrets))

const attachWith = async (
  {
    lambda,
    name,
    layerArn,
    prepare,
    sleep = defaultSleep,
    now = Date.now,
    random = Math.random,
  },
  secrets,
) => {
  let lastRace
  for (let race = 0; race < MAX_RACES; race += 1) {
    const live = await readSettled({ lambda, name, sleep, now })
    if (live && isEnvUnreadable(live)) {
      return {
        status: 'rejected',
        reason: 'env_unreadable',
        why: ENV_UNREADABLE_WHY,
      }
    }
    if (live) collectSecrets(secrets, variablesOf(live))
    const decision = await prepare(live)
    if (decision.skip) return { status: 'skipped', row: decision.skip }
    collectSecrets(secrets, decision.variables)
    try {
      await lambda.updateFunctionConfiguration({
        FunctionName: name,
        RevisionId: live.RevisionId,
        Layers: attachLayers(layerArnsOf(live), decision.layerArn ?? layerArn),
        Environment: { Variables: decision.variables },
      })
    } catch (error) {
      if (RACES.has(error?.name)) {
        lastRace = error.name
        await afterRace({ error, race, sleep, random })
        continue
      }
      if (isCredentialError(error)) rethrow(error)
      const rejection = mapAttachRejection(error)
      if (rejection) return { status: 'rejected', ...rejection }
      return { status: 'failed', message: error.message }
    }
    return (
      (await settledOutcome({ lambda, name, sleep, now })) ?? {
        status: 'attached',
        // The configuration the write was made against (what runs there, apart from Dev Mode's
        // layer and variables), and the row it was classified as.
        live,
        ...(decision.row && { row: decision.row }),
      }
    )
  }
  return gaveUp(lastRace, 'attached')
}

/** An original wrapper that restore leaves out because the layer providing it is gone. */
const droppedWrapperNotes = (live, restored) => {
  const original = live[ENV.ORIGINAL_WRAPPER]
  if (
    live[EXEC_WRAPPER] !== WRAPPER_PATH ||
    original === undefined ||
    original === WRAPPER_PATH ||
    restored[EXEC_WRAPPER] === original
  ) {
    return []
  }
  return [
    {
      reason: 'original_wrapper_dropped',
      message: `its exec wrapper ${original} was not put back: the layer that provides it is no longer attached`,
    },
  ]
}

/**
 * With unreadable variables nothing is written. Removing only the layer would leave
 * AWS_LAMBDA_EXEC_WRAPPER pointing at a wrapper that no longer exists, and the function would
 * fail to start. Without a Dev Mode layer there is no sign it was ever attached.
 */
const unreadableRestore = (name, layerArns, scope) =>
  layerArns.some((arn) => isDevModeLayerArn(arn, { scope }))
    ? {
        status: 'failed',
        message: `Dev Mode cannot read the environment variables of ${name}: they are encrypted with a KMS key you cannot decrypt. Nothing was changed; get kms:Decrypt on that key, then restore it again.`,
      }
    : {
        status: 'unchanged',
        notes: [
          {
            reason: 'env_unreadable',
            message: `${ENV_UNREADABLE_WHY}, so Dev Mode cannot tell whether it is set up`,
          },
        ],
      }

/**
 * Restores from the live configuration: removes Dev Mode layers and exactly the Dev Mode
 * variables, reinstating an original exec wrapper only while its layer is attached. With
 * `onlySession`, a function another session took over is left alone. No outcome or error message
 * carries the session key or the ExternalId the function had.
 */
export const restoreFunction = (options) =>
  withoutSecrets((secrets) => restoreWith(options, secrets))

const restoreWith = async (
  {
    lambda,
    name,
    onlySession,
    sleep = defaultSleep,
    now = Date.now,
    random = Math.random,
  },
  secrets,
) => {
  let lastRace
  for (let race = 0; race < MAX_RACES; race += 1) {
    const live = await readSettled({ lambda, name, sleep, now })
    if (!live) return { status: 'missing' }
    const layerArns = layerArnsOf(live)
    const scope = live.FunctionArn
    if (isEnvUnreadable(live)) return unreadableRestore(name, layerArns, scope)
    const variables = variablesOf(live)
    collectSecrets(secrets, variables)
    if (!isAttached({ variables })) {
      return { status: 'unchanged' }
    }
    const attachment = readAttachment(variables)
    if (onlySession && attachment && attachment.session !== onlySession) {
      return { status: 'skipped', attachment }
    }
    const remaining = detachLayers(layerArns, scope)
    const restored = buildRestoreVariables({
      live: variables,
      remainingLayerArns: remaining,
    })
    try {
      await lambda.updateFunctionConfiguration({
        FunctionName: name,
        RevisionId: live.RevisionId,
        Layers: remaining,
        Environment: { Variables: restored },
      })
    } catch (error) {
      if (RACES.has(error?.name)) {
        lastRace = error.name
        await afterRace({ error, race, sleep, random })
        continue
      }
      if (isCredentialError(error)) rethrow(error)
      return { status: 'failed', message: error.message }
    }
    return (
      (await settledOutcome({ lambda, name, sleep, now })) ?? {
        status: 'restored',
        attachment,
        notes: droppedWrapperNotes(variables, restored),
      }
    )
  }
  return gaveUp(lastRace, 'restored it')
}

/**
 * Restores many functions, at most CONTROL_PLANE_PARALLELISM at a time. Every function gets an
 * outcome; an error on one never stops the others.
 */
export const restoreFunctions = async ({
  lambda,
  names,
  onlySession,
  concurrency = CONTROL_PLANE_PARALLELISM,
  onProgress = () => {},
  sleep = defaultSleep,
  now = Date.now,
  random = Math.random,
}) => {
  const limit = pLimit(
    Math.max(1, Math.min(concurrency, CONTROL_PLANE_PARALLELISM)),
  )
  const result = {
    restored: [],
    unchanged: [],
    skipped: [],
    missing: [],
    failed: [],
  }
  let done = 0
  await Promise.all(
    names.map((name) =>
      limit(async () => {
        let outcome
        try {
          outcome = await restoreFunction({
            lambda,
            name,
            onlySession,
            sleep,
            now,
            random,
          })
        } catch (error) {
          outcome = { status: 'failed', message: error.message }
        }
        result[outcome.status].push({ name, ...outcome })
        done += 1
        try {
          onProgress({ done, total: names.length, name, outcome })
        } catch {
          // Progress display is best effort; the outcome is already recorded.
        }
      }),
    ),
  )
  return result
}

/** How one function read during a session stands for that session. */
const attachmentState = (name, config, sessionId) => {
  if (!config) return { name, state: 'function_deleted' }
  const hasDevLayer = layerArnsOf(config).some((arn) =>
    isDevModeLayerArn(arn, { scope: config.FunctionArn }),
  )
  if (isEnvUnreadable(config)) {
    // Without the layer the function cannot run the Dev Mode wrapper, whatever its variables say.
    return { name, state: hasDevLayer ? 'env_unreadable' : 'detached' }
  }
  const variables = variablesOf(config)
  // The wrapper is gone with the layer: the function fails to start until it is restored.
  if (variables[EXEC_WRAPPER] === WRAPPER_PATH && !hasDevLayer) {
    return { name, state: 'layer_missing' }
  }
  const attachment = readAttachment(variables)
  if (!attachment) return { name, state: 'detached' }
  const { owner } = attachment
  if (attachment.session !== sessionId) {
    return { name, state: 'taken_over', owner }
  }
  if (variables[EXEC_WRAPPER] !== WRAPPER_PATH) {
    return { name, state: 'wrapper_replaced', owner }
  }
  return { name, state: 'attached', owner }
}

/**
 * How each function in `names` stands for the session `sessionId`, in the order of `names`:
 * `attached`, `wrapper_replaced` (something else set AWS_LAMBDA_EXEC_WRAPPER), `detached` (its Dev
 * Mode configuration was removed), `taken_over` (another session attached it, with its `owner`),
 * `function_deleted`, `env_unreadable` (it still has the Dev Mode layer, and its variables can no
 * longer be read), `layer_missing` (AWS_LAMBDA_EXEC_WRAPPER still points at the Dev Mode wrapper
 * and the layer that provides it is gone), or `unchecked` with the `error` its read failed with.
 *
 * Reads only, with `lambda.getFunction`, at most CONTROL_PLANE_PARALLELISM at a time; it never
 * retries. The check fails as a whole only when no function could be read: expired credentials
 * first, then a denial, then the first error.
 */
export const checkAttachments = async ({
  lambda,
  names,
  sessionId,
  concurrency = CONTROL_PLANE_PARALLELISM,
}) => {
  const limit = pLimit(
    Math.max(1, Math.min(concurrency, CONTROL_PLANE_PARALLELISM)),
  )
  const reads = await Promise.allSettled(
    names.map((name) => limit(() => lambda.getFunction(name))),
  )
  const errors = reads
    .filter((read) => read.status === 'rejected')
    .map((read) => read.reason)
  if (errors.length && errors.length === reads.length) {
    rethrow(
      errors.find(isCredentialError) ??
        errors.find(isAccessDenied) ??
        errors[0],
    )
  }
  return reads.map(({ status, value, reason }, i) =>
    status === 'rejected'
      ? { name: names[i], state: 'unchecked', error: reason }
      : attachmentState(names[i], value, sessionId),
  )
}

/**
 * Reads each function in `names` (the deployed names of one service's functions) with GetFunction,
 * at most CONTROL_PLANE_PARALLELISM at a time, and returns, in the order of `names`, those that
 * carry Dev Mode configuration. One with a Dev Mode layer whose variables cannot be read is
 * returned as `{ name, attachment: null, unreadable: true }`; one that does not exist is left out.
 * The cost follows the size of the service, never the number of functions in the account.
 *
 * Every read settles before the result is decided. Any failed read fails the whole lookup, so a
 * caller never acts on part of a stage: expired credentials first, then a denial, then any other
 * error. With `stopAtFailure`, the reads not started when one fails are skipped: the lookup fails
 * anyway, and a throttled account is not read any further.
 */
export const findAttachedFunctions = async ({
  lambda,
  names,
  concurrency = CONTROL_PLANE_PARALLELISM,
  stopAtFailure = false,
}) => {
  if (!Array.isArray(names)) {
    throw new TypeError(
      'findAttachedFunctions needs the names of the functions to look at',
    )
  }
  const wanted = [...new Set(names)]
  if (wanted.length === 0) return []
  const limit = pLimit(
    Math.max(1, Math.min(concurrency, CONTROL_PLANE_PARALLELISM)),
  )
  let failed = false
  const read = async (name) => {
    if (failed && stopAtFailure) return null
    try {
      return await lambda.getFunction(name)
    } catch (error) {
      failed = true
      throw error
    }
  }
  const reads = await Promise.allSettled(
    wanted.map((name) => limit(() => read(name))),
  )
  const errors = reads
    .filter((read) => read.status === 'rejected')
    .map((read) => read.reason)
  if (errors.length) {
    rethrow(
      errors.find(isCredentialError) ??
        errors.find(isAccessDenied) ??
        errors[0],
    )
  }
  const found = []
  reads.forEach(({ value: config }, i) => {
    if (!config) return
    const name = wanted[i]
    const layerArns = layerArnsOf(config)
    if (isEnvUnreadable(config)) {
      if (
        layerArns.some((arn) =>
          isDevModeLayerArn(arn, { scope: config.FunctionArn }),
        )
      ) {
        found.push({ name, attachment: null, unreadable: true })
      }
      return
    }
    const variables = variablesOf(config)
    if (isAttached({ variables })) {
      found.push({ name, attachment: readAttachment(variables) })
    }
  })
  return found
}
