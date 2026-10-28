/**
 * The undo record: what an attached function carries so that any later CLI can restore it from
 * its live configuration alone (no SSM, no tags). The rules: record the original wrapper and the
 * layer that provides it; never record our own wrapper as the original; reinstate the original
 * only while its layer is still attached; leave a wrapper someone else set during the session
 * alone; delete exactly our variables.
 */
import { createHash } from 'crypto'
import {
  DEVMODE_VARIABLE_NAMES,
  ENV,
  ENV_LIMIT_BYTES,
  EXEC_WRAPPER,
  UNDO_RECORD_VERSION,
  WRAPPER_PATH,
  isDevModeLayerArn,
} from './naming.js'

export const envSize = (variables) =>
  Buffer.byteLength(JSON.stringify(variables ?? {}), 'utf8')

/** `variables` are the ones that will be written, session key and endpoint included. */
export const fitsEnvBudget = (variables) =>
  envSize(variables) <= ENV_LIMIT_BYTES

export const variablesOf = (config) => config?.Environment?.Variables ?? {}

/**
 * Variables encrypted with a KMS key the caller cannot decrypt come back as `Environment.Error`
 * with no `Variables`. `variablesOf` then reads as empty, so writing an environment derived from
 * it would delete every variable the function has.
 */
export const isEnvUnreadable = (config) =>
  Boolean(
    config?.Environment &&
    (config.Environment.Error || !config.Environment.Variables),
  )
export const ENV_UNREADABLE_WHY =
  'its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt)'
export const layerArnsOf = (config) =>
  (config?.Layers ?? []).map((layer) => layer.Arn)

/**
 * Ours goes first; an older Dev Mode layer of this account and region is replaced (two versions of
 * one layer are rejected).
 */
export const attachLayers = (liveArns, ourArn) => [
  ourArn,
  ...liveArns.filter((arn) => !isDevModeLayerArn(arn, { scope: ourArn })),
]
/** The layers without Dev Mode's; `scope` is the function's ARN (see isDevModeLayerArn). */
export const detachLayers = (liveArns, scope) =>
  liveArns.filter((arn) => !isDevModeLayerArn(arn, { scope }))

export const layersFingerprint = (layerArns) =>
  createHash('sha256')
    .update([...layerArns].sort().join('\n'))
    .digest('hex')
    .slice(0, 16)

// Wrappers whose providing layer is known: Serverless Dashboard SDKs and its OpenTelemetry extension.
// A layer name may carry a version suffix (`sls-sdk-node-v0-15-15`) or none (`sls-sdk-node`).
const KNOWN_WRAPPER_LAYERS = Object.freeze([
  ['/opt/sls-sdk-node/', /:layer:sls-sdk-node[-:]/],
  ['/opt/sls-sdk-python/', /:layer:sls-sdk-python[-:]/],
  ['/opt/otel-extension-internal-node/', /:layer:sls-otel-extension-node[-:]/],
])
const knownLayerMarker = (wrapper) =>
  KNOWN_WRAPPER_LAYERS.find(([prefix]) => wrapper.startsWith(prefix))?.[1]

const ORIGINAL_NAMES = [
  ENV.ORIGINAL_WRAPPER,
  ENV.ORIGINAL_WRAPPER_LAYER,
  ENV.LAYERS_AT_ATTACH,
]

/** An empty wrapper is recorded as is: restore puts back exactly what was there. */
const recordOriginal = (wrapper, otherLayerArns) => {
  const record = { [ENV.ORIGINAL_WRAPPER]: wrapper }
  if (!wrapper.startsWith('/opt/')) return record
  const layers = detachLayers(otherLayerArns)
  const marker = knownLayerMarker(wrapper)
  const providing = marker && layers.find((arn) => marker.test(arn))
  if (providing) record[ENV.ORIGINAL_WRAPPER_LAYER] = providing
  else record[ENV.LAYERS_AT_ATTACH] = layersFingerprint(layers)
  return record
}

/** `variables` without any of Dev Mode's. */
export const withoutDevModeVariables = (variables) => {
  const rest = { ...variables }
  for (const name of DEVMODE_VARIABLE_NAMES) delete rest[name]
  return rest
}

/**
 * The session's part of the undo record, the same for a function and a web app's dev revision:
 * the bridge reads these to reach the session.
 */
export const sessionVariables = (session) => ({
  [ENV.VERSION]: UNDO_RECORD_VERSION,
  [ENV.SESSION]: session.id,
  [ENV.OWNER]: session.owner,
  [ENV.ATTACHED_AT]: String(session.attachedAt),
  [ENV.BROKER_ROLE_ARN]: session.broker.arn,
  [ENV.BROKER_EXTERNAL_ID]: session.broker.externalId,
  [ENV.SESSION_KEY]: session.key,
  [ENV.IOT_ENDPOINT]: session.iotEndpoint,
})

/**
 * Variables for an attached function, derived from its live variables. When the live wrapper is
 * already ours (a crashed session, a re-attach, a take-over), the recorded original is kept.
 */
export const buildAttachVariables = ({ live, otherLayerArns, session }) => {
  const liveWrapper = live[EXEC_WRAPPER]
  let original = {}
  if (liveWrapper === WRAPPER_PATH) {
    for (const name of ORIGINAL_NAMES) {
      if (live[name] !== undefined) original[name] = live[name]
    }
    if (original[ENV.ORIGINAL_WRAPPER] === WRAPPER_PATH) original = {}
  } else if (liveWrapper !== undefined) {
    original = recordOriginal(liveWrapper, otherLayerArns)
  }
  return {
    ...withoutDevModeVariables(live),
    [EXEC_WRAPPER]: WRAPPER_PATH,
    ...sessionVariables(session),
    ...original,
  }
}

const canReinstate = (original, live, remainingLayerArns) => {
  if (!original.startsWith('/opt/')) return true
  if (live[ENV.ORIGINAL_WRAPPER_LAYER]) {
    const marker = knownLayerMarker(original)
    return marker
      ? remainingLayerArns.some((arn) => marker.test(arn))
      : remainingLayerArns.includes(live[ENV.ORIGINAL_WRAPPER_LAYER])
  }
  const fingerprint = live[ENV.LAYERS_AT_ATTACH]
  return (
    Boolean(fingerprint) &&
    layersFingerprint(detachLayers(remainingLayerArns)) === fingerprint
  )
}

/** Variables after restore, derived from the live variables and the layers that stay. */
export const buildRestoreVariables = ({ live, remainingLayerArns }) => {
  const variables = { ...live }
  for (const name of DEVMODE_VARIABLE_NAMES) delete variables[name]
  if (live[EXEC_WRAPPER] !== WRAPPER_PATH) return variables
  delete variables[EXEC_WRAPPER]
  const original = live[ENV.ORIGINAL_WRAPPER]
  if (
    original !== undefined &&
    original !== WRAPPER_PATH &&
    canReinstate(original, live, remainingLayerArns)
  ) {
    variables[EXEC_WRAPPER] = original
  }
  return variables
}

export const readAttachment = (variables = {}) =>
  variables[ENV.SESSION]
    ? {
        session: variables[ENV.SESSION],
        owner: variables[ENV.OWNER] || 'unknown',
        attachedAt: Number(variables[ENV.ATTACHED_AT]) || undefined,
      }
    : null

/**
 * The names every attach writes since the first undo record (the session key and endpoint came
 * later, so a record without them still counts). All of them, with this record version, mean Dev
 * Mode wrote them; a function that sets only some of them itself does not count as attached.
 */
const RECORD_NAMES = [
  ENV.SESSION,
  ENV.OWNER,
  ENV.ATTACHED_AT,
  ENV.BROKER_ROLE_ARN,
  ENV.BROKER_EXTERNAL_ID,
]
const hasUndoRecord = (variables) =>
  variables[ENV.VERSION] === UNDO_RECORD_VERSION &&
  RECORD_NAMES.every((name) => Boolean(variables[name]))

/**
 * Whether Dev Mode attached the function: its wrapper or its complete undo record. Anything less is
 * not an attachment, and a restore never changes such a function. A function's own SLS_DEV_SESSION,
 * say, is refused as `reserved_variable`. A layer with Dev Mode's name proves nothing either: Dev
 * Mode writes its layer, wrapper and undo record in one update, so a function it attached never
 * has the layer alone. A session replaces such a layer when Dev Mode published its version (its
 * description says so: something removed Dev Mode's wrapper and variables but not its layer), and
 * refuses the function as `layer_name_taken` otherwise (eligibility.js).
 */
export const isAttached = ({ variables = {} }) =>
  variables[EXEC_WRAPPER] === WRAPPER_PATH || hasUndoRecord(variables)
