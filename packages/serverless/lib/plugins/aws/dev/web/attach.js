/**
 * Attaches Dev Mode to one web app and restores it. A web function has no layers or exec wrapper,
 * so a session creates a dev revision (the bridge, with the deployed settings) and moves `main`'s
 * traffic to it. Requests the machine does not take go to the endpoint `sls-dev-fallback`, which
 * serves a clone of the deployed revision: pinning an endpoint to the revision CloudFormation
 * manages would block that revision's deletion on the next deploy. A `--local-only` web app gets
 * the dev revision behind `sls-dev-local` alone, and `main` is not touched.
 *
 * Everything Dev Mode creates is found again from AWS alone: its endpoints by name, its revisions
 * by SLS_DEV_REVISION_ROLE in their environment, and the revision `main` goes back to by the dev
 * revision's SLS_DEV_RESTORE_REVISION.
 */
import pLimit from 'p-limit'
import { ServerlessError } from '@serverless/util'
import {
  isAccessDenied,
  isCredentialError,
  sleep as defaultSleep,
} from '../attach/aws.js'
import {
  DEV_MODE_ENDPOINTS,
  ENV,
  FALLBACK_ENDPOINT,
  LOCAL_ENDPOINT,
  WEB_BRIDGE_ENTRY,
  WEB_ENV_LIMIT_BYTES,
} from '../attach/naming.js'
import {
  envSize,
  sessionVariables,
  withoutDevModeVariables,
} from '../attach/undo-record.js'
import { CONTROL_PLANE_PARALLELISM } from '../attach/attach.js'

export const MAIN_ENDPOINT = 'main'
/** The auth types an endpoint of a web function has; the fallback copies `main`'s. */
export const FALLBACK_AUTH_TYPES = Object.freeze([
  'ApplicationManaged',
  'IamAuth',
])
/** The runtime the bridge is built for (arm64, the only architecture of web functions). */
export const BRIDGE_RUNTIME = 'nodejs24.x'
const ENTRYPOINT = 'AWS_LAMBDA_NODEJS_ENTRYPOINT'
const DESCRIPTION_PREFIX = 'Serverless Dev Mode '

/** `Serverless Dev Mode <role> for session <id>`: what a Dev Mode revision says it is. */
export const revisionDescription = (role, sessionId) =>
  `${DESCRIPTION_PREFIX}${role} for session ${sessionId}`
const SESSION_IN_DESCRIPTION = /^Serverless Dev Mode \S+ for session (\S+)$/

const variablesOf = (revision) =>
  revision?.serviceConfig?.environmentVariables ?? {}
const roleOf = (revision) => variablesOf(revision)[ENV.REVISION_ROLE]

/** The session a Dev Mode revision belongs to: its variables, else its description (a clone). */
const sessionOf = (revision) =>
  variablesOf(revision)[ENV.SESSION] ??
  SESSION_IN_DESCRIPTION.exec(revision?.description ?? '')?.[1]

/**
 * The revision an endpoint serves: the one with the highest weight (the first of equals). A canary
 * that splits `main` between two revisions is restored to the heavier one alone.
 */
export const mainRevisionOf = (endpoint) =>
  [...(endpoint?.revisionWeights ?? [])].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0),
  )[0]?.revisionId

const throwIfAborted = (signal) => signal?.throwIfAborted()

const environmentTooLarge = ({ webApp, size, added }) =>
  new ServerlessError(
    `The environment variables of the web app ${webApp} would take ${size} bytes in Dev Mode, over the AWS Lambda limit of ${WEB_ENV_LIMIT_BYTES} bytes: Dev Mode adds ${added} bytes to the deployed ones. Remove variables the web app does not need, then run the command again.`,
    'DEV_MODE_WEB_APP_ENVIRONMENT_TOO_LARGE',
    { stack: false },
  )
const ENV_REFUSED =
  /environmentVariables cannot exceed \d+ bytes\. The current size is (\d+) bytes/

/**
 * Attaches one web app for `session` (id, owner, attachedAt, broker, key, iotEndpoint: what a
 * function's undo record carries). In order, because a revision's settings are create-only and
 * the dev revision carries the fallback's URL: (1) the clone of the deployed revision, (2)
 * `sls-dev-fallback` on the clone, (3) the dev revision, (4) `main` moved to the dev revision. With
 * `localOnly`, only the dev revision and `sls-dev-local` on it.
 *
 * `onCreated(resource)` is called as soon as each create returns, before its wait, and once `main`
 * is moved (`type: 'traffic'`), so the session's exit path can delete exactly what exists
 * (`deleteCreated`). With `signal` aborted, the attach stops before its next create or traffic
 * move. Several web apps attach in parallel: nothing here is shared between calls.
 *
 * `mainRevisionId` is the revision `main` serves; without it, `main` is read.
 *
 * Resolves the revisions it created (`devRevisionId`, `cloneRevisionId`), the Dev Mode endpoints,
 * the deployed revision (`restoreRevisionId`) with its variables without Dev Mode's
 * (`deployedVariables`, what the server on this machine runs with), the real URL (`url`, `main`'s,
 * when it was read) and, with `localOnly`, the URL of `sls-dev-local` (`localUrl`).
 */
export const attachWebApp = async ({
  lambdaWeb,
  functionName,
  mainRevisionId,
  bridge,
  session,
  localOnly = false,
  onCreated = () => {},
  signal,
  webApp = functionName,
}) => {
  // `main` tells the revision to go back to and the fallback's auth type, which is `main`'s: an
  // ApplicationManaged web app gets its requests, Authorization included, as they came.
  const main =
    mainRevisionId && localOnly
      ? null
      : await lambdaWeb.getEndpoint({
          functionName,
          endpointName: MAIN_ENDPOINT,
        })
  const restoreRevisionId = mainRevisionId ?? mainRevisionOf(main)
  const fallbackAuth = FALLBACK_AUTH_TYPES.includes(main?.authType)
    ? main.authType
    : 'IamAuth'
  const deployed = restoreRevisionId
    ? await lambdaWeb.getRevision({
        functionName,
        revisionId: restoreRevisionId,
      })
    : null
  if (!deployed) {
    throw new ServerlessError(
      `The revision ${restoreRevisionId ?? '(none)'} that the endpoint ${MAIN_ENDPOINT} of the web function ${functionName} serves was not found. Deploy the service, then run the command again.`,
      'DEV_MODE_WEB_REVISION_NOT_FOUND',
      { stack: false },
    )
  }
  if (roleOf(deployed)) {
    throw new ServerlessError(
      `The endpoint ${MAIN_ENDPOINT} of the web function ${functionName} still serves a Dev Mode revision. Run "serverless dev restore", then run the command again.`,
      'DEV_MODE_WEB_APP_STILL_ATTACHED',
      { stack: false },
    )
  }
  const deployedVariables = withoutDevModeVariables(variablesOf(deployed))
  const deployedSize = envSize(variablesOf(deployed))
  const createRevision = async ({ role, buildConfig, variables }) => {
    throwIfAborted(signal)
    const size = envSize(variables)
    if (size > WEB_ENV_LIMIT_BYTES) {
      throw environmentTooLarge({ webApp, size, added: size - deployedSize })
    }
    let created
    try {
      created = await lambdaWeb.createRevision({
        functionName,
        description: revisionDescription(role, session.id),
        kmsKeyArn: deployed.kmsKeyArn,
        buildConfig,
        serviceConfig: {
          ...deployed.serviceConfig,
          environmentVariables: variables,
        },
      })
    } catch (error) {
      // A backstop for a limit AWS changes: its own count of the size.
      const refused =
        error?.name === 'ValidationException' &&
        ENV_REFUSED.exec(error.message ?? '')
      if (!refused) throw error
      const awsSize = Number(refused[1])
      throw environmentTooLarge({
        webApp,
        size: awsSize,
        added: awsSize - deployedSize,
      })
    }
    const { revisionId } = created
    onCreated({ type: 'revision', functionName, revisionId, role })
    await lambdaWeb.waitRevisionActive({ functionName, revisionId })
    return revisionId
  }
  const createEndpoint = async (endpointName, revisionId, authType) => {
    throwIfAborted(signal)
    await lambdaWeb.createEndpoint({
      functionName,
      endpointName,
      revisionId,
      authType,
    })
    onCreated({ type: 'endpoint', functionName, endpointName })
    return lambdaWeb.waitEndpointActive({ functionName, endpointName })
  }

  let cloneRevisionId
  let fallbackUrl
  if (!localOnly) {
    cloneRevisionId = await createRevision({
      role: 'clone',
      buildConfig: deployed.buildConfig,
      variables: { ...deployedVariables, [ENV.REVISION_ROLE]: 'clone' },
    })
    const fallback = await createEndpoint(
      FALLBACK_ENDPOINT,
      cloneRevisionId,
      fallbackAuth,
    )
    fallbackUrl = `https://${fallback.domainName}`
  }

  const devModeVariables = {
    ...sessionVariables(session),
    [ENV.RESTORE_REVISION]: restoreRevisionId,
    [ENV.REVISION_ROLE]: 'dev',
    [ENV.WEB_FUNCTION]: functionName,
    ...(fallbackUrl && {
      [ENV.FALLBACK_URL]: fallbackUrl,
      [ENV.FALLBACK_AUTH]: fallbackAuth,
    }),
  }
  const devRevisionId = await createRevision({
    role: 'dev',
    buildConfig: {
      codeConfig: { s3Object: { bucket: bridge.bucket, key: bridge.key } },
      runtimeConfig: { runtime: BRIDGE_RUNTIME },
    },
    variables: {
      ...deployedVariables,
      [ENTRYPOINT]: WEB_BRIDGE_ENTRY,
      ...devModeVariables,
    },
  })

  // What the web app's server on this machine runs with: the deployed revision's variables. With
  // its real URL (`main`'s), when `main` was read.
  const deployedOf = {
    restoreRevisionId,
    deployedVariables,
    // Its runtime (`nodejs24.x`): the Node.js an `entry` run here is compared with.
    deployedRuntime: deployed.buildConfig?.runtimeConfig?.runtime,
    // Its request timeout in seconds, when the revision sets one: how long a request running here
    // keeps a detached session busy.
    ...(Number.isFinite(deployed.serviceConfig?.timeoutSeconds) && {
      deployedTimeoutSeconds: deployed.serviceConfig.timeoutSeconds,
    }),
    ...(main?.domainName && { url: `https://${main.domainName}` }),
  }
  if (localOnly) {
    // Only the CLI calls it, signed with the developer's credentials.
    const local = await createEndpoint(LOCAL_ENDPOINT, devRevisionId, 'IamAuth')
    return {
      devRevisionId,
      cloneRevisionId,
      endpoints: [LOCAL_ENDPOINT],
      ...deployedOf,
      localUrl: `https://${local.domainName}`,
    }
  }
  throwIfAborted(signal)
  // Not waited for: traffic moves about 2.4 s after the call, and the session's checks follow it.
  await lambdaWeb.updateEndpointWeights({
    functionName,
    endpointName: MAIN_ENDPOINT,
    revisionId: devRevisionId,
  })
  onCreated({
    type: 'traffic',
    functionName,
    endpointName: MAIN_ENDPOINT,
    revisionId: devRevisionId,
    restoreRevisionId,
  })
  return {
    devRevisionId,
    cloneRevisionId,
    endpoints: [FALLBACK_ENDPOINT],
    ...deployedOf,
  }
}

/**
 * How long a revision delete answered with 409 is tried again: an endpoint deleted just before
 * holds its revisions for about 1.3 s after its delete returned (probed: 6 of 6 runs), and `main`
 * holds the revision its weights just left for about 1 s (probed: 3 of 3 runs).
 */
const DELETE_REVISION_BUDGET_MS = 5_000
const DELETE_REVISION_POLL_MS = 500
const HOLDING_ENDPOINTS = /endpoints \[([^\]]*)\]/

/**
 * Whether a 409 on a revision delete lasts: `main` still lists the revision in its weights, or the
 * revision serves an endpoint that exists and is not being deleted (a create in flight, another
 * session's endpoint). Those do not clear by waiting, so the delete is not tried again. A `main`
 * whose weights already left the revision (a restore just moved it back) lets go of it once the
 * update lands.
 */
const isLastingConflict = async ({
  lambdaWeb,
  functionName,
  revisionId,
  error,
}) => {
  const names = (HOLDING_ENDPOINTS.exec(error.message ?? '')?.[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  for (const endpointName of names) {
    const endpoint = await lambdaWeb.getEndpoint({ functionName, endpointName })
    if (endpointName === MAIN_ENDPOINT) {
      const weights = endpoint?.revisionWeights ?? []
      if (weights.some((weight) => weight.revisionId === revisionId)) {
        return true
      }
      continue
    }
    if (endpoint && endpoint.state !== 'Deleting') return true
  }
  return false
}

/**
 * Deletes a revision. A 409 left by an endpoint being deleted, or by `main` moving away from it, is
 * tried again every 500 ms for up to 5 s; one that lasts (see isLastingConflict) is thrown at once.
 * True once deleted, false when it was already gone.
 */
const deleteRevision = async ({
  lambdaWeb,
  functionName,
  revisionId,
  sleep,
  now,
}) => {
  const started = now()
  for (;;) {
    try {
      return await lambdaWeb.deleteRevision({ functionName, revisionId })
    } catch (error) {
      if (
        error?.name !== 'ConflictException' ||
        now() - started >= DELETE_REVISION_BUDGET_MS ||
        (await isLastingConflict({
          lambdaWeb,
          functionName,
          revisionId,
          error,
        }))
      ) {
        throw error
      }
      await sleep(DELETE_REVISION_POLL_MS)
    }
  }
}

/** Moves `main` back to `restoreRevisionId` when it still serves `devRevisionId`. */
const moveMainBack = async ({
  lambdaWeb,
  functionName,
  main,
  devRevisionId,
  restoreRevisionId,
}) => {
  if (!main || mainRevisionOf(main) !== devRevisionId) return false
  try {
    await lambdaWeb.updateEndpointWeights({
      functionName,
      endpointName: MAIN_ENDPOINT,
      revisionId: restoreRevisionId,
    })
  } catch (error) {
    // `main` was just read, so what is missing is the revision it goes back to.
    if (error?.name !== 'ResourceNotFoundException') throw error
    throw new ServerlessError(
      `The revision ${restoreRevisionId} that the endpoint ${MAIN_ENDPOINT} of the web function ${functionName} served before Dev Mode no longer exists, so ${MAIN_ENDPOINT} still serves the Dev Mode revision. Deploy the service to put ${MAIN_ENDPOINT} on a deployed revision, then run "serverless dev restore".`,
      'DEV_MODE_WEB_RESTORE_REVISION_GONE',
      { stack: false },
    )
  }
  return true
}

/**
 * Undoes what one attach reported through `onCreated` (`created`, in the order reported): `main`
 * goes back first when it still serves the dev revision, then the endpoints that still serve one of
 * its revisions, then the revisions.
 * Every resource is attempted; one that fails is reported in `failures` (`{ resource, message }`),
 * never thrown, and a missing one is not a failure, so it is safe to run again.
 *
 * The exit path's order: abort the attach's signal, await the attach (it stops before its next
 * step, and its waiters fail within seconds once a resource is gone), then run this once with the
 * same `created` list, which then holds every create that landed.
 */
export const deleteCreated = async ({
  lambdaWeb,
  created,
  sleep = defaultSleep,
  now = Date.now,
}) => {
  const failures = []
  const attempt = async (resource, action) => {
    try {
      await action()
    } catch (error) {
      failures.push({ resource, message: error.message })
    }
  }
  const items = [...created]
  for (const traffic of items.filter(({ type }) => type === 'traffic')) {
    await attempt(traffic, async () =>
      moveMainBack({
        lambdaWeb,
        functionName: traffic.functionName,
        main: await lambdaWeb.getEndpoint({
          functionName: traffic.functionName,
          endpointName: traffic.endpointName,
        }),
        devRevisionId: traffic.revisionId,
        restoreRevisionId: traffic.restoreRevisionId,
      }),
    )
  }
  // An endpoint is deleted only while it serves a revision this attach created: a session that
  // took the web app over since may have created its own under the same name.
  const createdRevisions = new Set(
    items
      .filter(({ type }) => type === 'revision')
      .map(({ functionName, revisionId }) => `${functionName}/${revisionId}`),
  )
  for (const endpoint of items.filter(({ type }) => type === 'endpoint')) {
    await attempt(endpoint, async () => {
      const { functionName, endpointName } = endpoint
      const current = await lambdaWeb.getEndpoint({
        functionName,
        endpointName,
      })
      const revisionId = mainRevisionOf(current)
      if (!createdRevisions.has(`${functionName}/${revisionId}`)) return
      await lambdaWeb.deleteEndpoint({ functionName, endpointName })
    })
  }
  for (const revision of items.filter(({ type }) => type === 'revision')) {
    await attempt(revision, () =>
      deleteRevision({
        lambdaWeb,
        functionName: revision.functionName,
        revisionId: revision.revisionId,
        sleep,
        now,
      }),
    )
  }
  return { failures }
}

/**
 * Restores one web app from AWS alone: when `main` serves a dev revision (of `sessionId`, when
 * given), it goes back to that revision's SLS_DEV_RESTORE_REVISION; then `sls-dev-fallback` and
 * `sls-dev-local` are deleted, then every revision whose environment has SLS_DEV_REVISION_ROLE.
 * With `sessionId`, another session's endpoints and revisions are left as they are. The revision
 * `main` serves is never deleted. Missing resources are not errors, so it is safe to run again.
 *
 * Only revisions whose description is Dev Mode's are read for their environment, so a restore
 * costs one read per Dev Mode revision, not one per revision of the web function.
 */
export const restoreWebApp = async ({
  lambdaWeb,
  functionName,
  sessionId,
  sleep = defaultSleep,
  now = Date.now,
}) => {
  try {
    const reads = new Map()
    const read = (revisionId) => {
      if (!reads.has(revisionId)) {
        reads.set(
          revisionId,
          lambdaWeb.getRevision({ functionName, revisionId }),
        )
      }
      return reads.get(revisionId)
    }
    const ours = (revision) =>
      Boolean(roleOf(revision)) &&
      (!sessionId || sessionOf(revision) === sessionId)
    let changed = false

    const main = await lambdaWeb.getEndpoint({
      functionName,
      endpointName: MAIN_ENDPOINT,
    })
    const mainRevisionId = mainRevisionOf(main)
    let servedRevisionId = mainRevisionId
    const served = mainRevisionId ? await read(mainRevisionId) : null
    if (roleOf(served) === 'clone' && ours(served)) {
      return {
        state: 'failed',
        message: `The endpoint ${MAIN_ENDPOINT} of the web function ${functionName} serves ${mainRevisionId}, a Dev Mode clone of a deployed revision, so Dev Mode cannot tell which revision to put back. Point ${MAIN_ENDPOINT} at the deployed revision (deploy a change with "serverless deploy", or pick the revision in the AWS Lambda console), then run "serverless dev restore".`,
      }
    }
    if (roleOf(served) === 'dev' && ours(served)) {
      const restoreRevisionId = variablesOf(served)[ENV.RESTORE_REVISION]
      changed = await moveMainBack({
        lambdaWeb,
        functionName,
        main,
        devRevisionId: mainRevisionId,
        restoreRevisionId,
      })
      servedRevisionId = restoreRevisionId
    }

    for (const endpointName of DEV_MODE_ENDPOINTS) {
      if (sessionId) {
        const endpoint = await lambdaWeb.getEndpoint({
          functionName,
          endpointName,
        })
        const revisionId = mainRevisionOf(endpoint)
        if (!revisionId || !ours(await read(revisionId))) continue
      }
      if (await lambdaWeb.deleteEndpoint({ functionName, endpointName })) {
        changed = true
      }
    }

    const candidates = (await lambdaWeb.listRevisions({ functionName })).filter(
      ({ revisionId, description }) =>
        revisionId !== servedRevisionId &&
        description?.startsWith(DESCRIPTION_PREFIX),
    )
    const failures = []
    for (const { revisionId } of candidates) {
      if (!ours(await read(revisionId))) continue
      try {
        if (
          await deleteRevision({
            lambdaWeb,
            functionName,
            revisionId,
            sleep,
            now,
          })
        ) {
          changed = true
        }
      } catch (error) {
        if (isCredentialError(error)) throw error
        failures.push(error.message)
      }
    }
    if (failures.length) {
      return {
        state: 'failed',
        message: `Dev Mode could not delete every revision it created for the web function ${functionName}: ${failures.join(' ')}`,
      }
    }
    return { state: changed ? 'restored' : 'unchanged' }
  } catch (error) {
    if (isCredentialError(error)) throw error
    return { state: 'failed', message: error.message }
  }
}

/**
 * The web apps in `webApps` that Dev Mode is attached to, in their order: `main` serves a dev
 * revision, or a Dev Mode endpoint is present (a `--local-only` web app, or an attach that stopped
 * before moving `main`), or, with `orphan: true`, a Dev Mode revision no endpoint serves (an attach
 * that stopped between a revision and its endpoint). Each comes with the session it belongs to and
 * that session's owner (`unknown` when only a clone tells: it carries the session in its
 * description alone). Reads only: one endpoint listing per web app and one revision read for the
 * endpoint that tells; when none tells, one revision listing and a read of each Dev Mode revision
 * no endpoint serves until one names its session. At most CONTROL_PLANE_PARALLELISM web apps at a
 * time; any failed read fails the lookup.
 */
export const findAttachedWebApps = async ({
  lambdaWeb,
  webApps,
  concurrency = CONTROL_PLANE_PARALLELISM,
}) => {
  const limit = pLimit(
    Math.max(1, Math.min(concurrency, CONTROL_PLANE_PARALLELISM)),
  )
  const found = await Promise.all(
    webApps.map(({ key, functionName }) =>
      limit(async () => {
        const endpoints = new Map(
          (await lambdaWeb.listEndpoints({ functionName })).map((endpoint) => [
            endpoint.endpointName,
            endpoint,
          ]),
        )
        // The dev revision tells the owner; the local endpoint serves one, the fallback a clone.
        for (const endpointName of [
          MAIN_ENDPOINT,
          LOCAL_ENDPOINT,
          FALLBACK_ENDPOINT,
        ]) {
          const revisionId = mainRevisionOf(endpoints.get(endpointName))
          if (!revisionId) continue
          const revision = await lambdaWeb.getRevision({
            functionName,
            revisionId,
          })
          if (!roleOf(revision)) continue
          return {
            key,
            functionName,
            sessionId: sessionOf(revision),
            owner: variablesOf(revision)[ENV.OWNER] || 'unknown',
          }
        }
        // Not deployed (yet): nothing to list.
        if (!endpoints.has(MAIN_ENDPOINT)) return null
        // A Dev Mode revision no endpoint serves: an attach that stopped between a revision and
        // its endpoint (a forced exit, a lost connection). It counts as left by its session.
        const served = new Set(
          [...endpoints.values()].flatMap(({ revisionWeights = [] }) =>
            revisionWeights.map(({ revisionId }) => revisionId),
          ),
        )
        const unserved = (
          await lambdaWeb.listRevisions({ functionName })
        ).filter(
          ({ revisionId, description }) =>
            !served.has(revisionId) &&
            description?.startsWith(DESCRIPTION_PREFIX),
        )
        for (const { revisionId } of unserved) {
          const revision = await lambdaWeb.getRevision({
            functionName,
            revisionId,
          })
          const sessionId = sessionOf(revision)
          if (!sessionId) continue
          return {
            key,
            functionName,
            sessionId,
            owner: variablesOf(revision)[ENV.OWNER] || 'unknown',
            orphan: true,
          }
        }
        return null
      }),
    ),
  )
  return found.filter(Boolean)
}

/**
 * What of the session `sessionId` a restore of it (`restoreWebApp`) deletes, from the lists alone
 * (`listEndpoints`, `listRevisions`): its Dev Mode revisions, told by their description, and the
 * Dev Mode endpoints that serve one of them. Counts of `{ revisions, endpoints }`.
 */
export const sessionResourceCounts = ({ endpoints, revisions, sessionId }) => {
  if (!sessionId) return { revisions: 0, endpoints: 0 }
  const ofSession = new Set(
    revisions
      .filter(
        ({ description }) =>
          SESSION_IN_DESCRIPTION.exec(description ?? '')?.[1] === sessionId,
      )
      .map(({ revisionId }) => revisionId),
  )
  return {
    revisions: ofSession.size,
    endpoints: endpoints.filter(
      (endpoint) =>
        DEV_MODE_ENDPOINTS.includes(endpoint.endpointName) &&
        ofSession.has(mainRevisionOf(endpoint)),
    ).length,
  }
}

/**
 * How each web app in `webApps` (`{ key, functionName, localOnly? }`) stands for the session
 * `sessionId`, in their order, as `{ webApp: key, state, owner?, localOnly? }`: `attached`,
 * `detached` (the endpoint it was attached through, `main` or for a `--local-only` web app
 * `sls-dev-local`, is gone or no longer serves a dev revision; `localOnly` says which),
 * `taken_over` (it serves another session's dev revision, with that
 * session's `owner`), `function_deleted`, or `unchecked` with the `error` its read failed with.
 *
 * Reads only, one attempt each (`getEndpointOnce`, `getRevisionOnce`), at most
 * CONTROL_PLANE_PARALLELISM web apps at a time. The check fails as a whole only when no web app
 * could be read: expired credentials first, then a denial, then the first error.
 */
export const checkWebAppAttachments = async ({
  lambdaWeb,
  webApps,
  sessionId,
  concurrency = CONTROL_PLANE_PARALLELISM,
}) => {
  const limit = pLimit(
    Math.max(1, Math.min(concurrency, CONTROL_PLANE_PARALLELISM)),
  )
  const stateOf = async ({ key, functionName, localOnly }) => {
    // `main` is the web function's own endpoint: without it, the web function is gone.
    const main = await lambdaWeb.getEndpointOnce({
      functionName,
      endpointName: MAIN_ENDPOINT,
    })
    if (!main) return { webApp: key, state: 'function_deleted' }
    const endpoint = localOnly
      ? await lambdaWeb.getEndpointOnce({
          functionName,
          endpointName: LOCAL_ENDPOINT,
        })
      : main
    const revisionId = mainRevisionOf(endpoint)
    const revision = revisionId
      ? await lambdaWeb.getRevisionOnce({ functionName, revisionId })
      : null
    if (roleOf(revision) !== 'dev') {
      return { webApp: key, state: 'detached', ...(localOnly && { localOnly }) }
    }
    const owner = variablesOf(revision)[ENV.OWNER] || 'unknown'
    if (sessionOf(revision) !== sessionId) {
      return { webApp: key, state: 'taken_over', owner }
    }
    return { webApp: key, state: 'attached', owner }
  }
  const reads = await Promise.allSettled(
    webApps.map((webApp) => limit(() => stateOf(webApp))),
  )
  const errors = reads
    .filter((read) => read.status === 'rejected')
    .map((read) => read.reason)
  if (errors.length && errors.length === reads.length) {
    throw (
      errors.find(isCredentialError) ?? errors.find(isAccessDenied) ?? errors[0]
    )
  }
  return reads.map(({ status, value, reason }, i) =>
    status === 'rejected'
      ? { webApp: webApps[i].key, state: 'unchecked', error: reason }
      : value,
  )
}
