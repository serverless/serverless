/**
 * Per-function mode: `dev` (events go to the working copy), `deployed` (the deployed code
 * answers; always with a reason) or `skipped` (not deployed yet, set up by an earlier Dev Mode, or
 * held by another session). The first matching check wins. Never throws on odd configuration: a
 * surprise here would abort the whole session.
 */
import { ServerlessError } from '@serverless/util'
import {
  DEVMODE_VARIABLE_NAMES,
  WRAPPER_VARIABLE_NAMES,
  isDevModeLayerArn,
} from './naming.js'
import {
  ENV_UNREADABLE_WHY,
  fitsEnvBudget,
  isAttached,
  isEnvUnreadable,
  layerArnsOf,
  readAttachment,
  variablesOf,
} from './undo-record.js'
import { adapterFor } from '../local/adapters/index.js'
import { cliCommand } from '../commands/cli-names.js'

const RUNTIME_LABELS = [
  ['java', 'Java'],
  ['dotnet', '.NET'],
  ['ruby', 'Ruby'],
]
const runtimeLabel = (runtime) =>
  RUNTIME_LABELS.find(([prefix]) => runtime.startsWith(prefix))?.[1] ?? runtime

const row = (name, mode, reason, why, extra = {}) => ({
  function: name,
  mode,
  reason,
  why,
  notes: [],
  ...extra,
})

const isEdgeFunction = (config) =>
  (Array.isArray(config.events) ? config.events : []).some(
    (event) => event && typeof event === 'object' && 'cloudFront' in event,
  )

/**
 * The shortest function timeout, in seconds, that can run on this machine: an invocation must
 * reach it, be accepted and still have time to run, and with 2 s or less the bridge never offers
 * one (the deployed code answers every invocation).
 */
export const MIN_DEV_TIMEOUT_SECONDS = 3

/** A timeout in seconds, or undefined when it is not a positive number. */
const secondsOf = (timeout) => {
  const seconds = Number(timeout)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

const isSet = (value) => value !== undefined && value !== null

/**
 * The timeout a function deploys with, in seconds: its own, else the provider's, else the
 * Framework's default of 6 (as packaging sets it). Undefined when the one that applies is not a
 * number known before the deployment (a CloudFormation reference, say): it is then not checked.
 */
export const resolvedTimeoutSeconds = (config, provider) => {
  if (isSet(config?.timeout)) return secondsOf(config.timeout)
  if (isSet(provider?.timeout)) return secondsOf(provider.timeout)
  return 6
}

const isLegacyShim = (live, variables) =>
  Boolean(variables.SLS_IOT_ENDPOINT && variables.SLS_FUNCTION) &&
  ['index.handler', 'index.streamHandler'].includes(live.Handler)

/**
 * Variables that point a function's AWS SDK at other endpoints than the region's standard ones:
 * FIPS, a custom endpoint for every service or for those the Dev Mode bridge calls (AWS STS, the
 * AWS IoT Core data plane), or a custom CA bundle. The bridge reaches AWS through the standard
 * endpoints only, so such a function keeps running its deployed code.
 */
const CUSTOM_ENDPOINT_VARIABLES = [
  'AWS_USE_FIPS_ENDPOINT',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_STS',
  'AWS_ENDPOINT_URL_IOT_DATA_PLANE',
  'AWS_CA_BUNDLE',
]

/** The names in CUSTOM_ENDPOINT_VARIABLES the variables set: FIPS only when it is "true". */
const customEndpointsOf = (variables) =>
  CUSTOM_ENDPOINT_VARIABLES.filter((name) => {
    const value = String(variables[name] ?? '').trim()
    if (name === 'AWS_USE_FIPS_ENDPOINT') return value.toLowerCase() === 'true'
    return value !== ''
  })

const aliasFeature = (config) => {
  if (config.provisionedConcurrency) return 'provisioned concurrency'
  if (config.snapStart) return 'SnapStart'
  if (config.durableConfig) return 'durable function'
  return null
}

/** A function --function or --skip-function leaves out of the session. */
const notSelectedRow = (name, selection) =>
  row(name, 'deployed', 'not_selected', `not selected (${selection.flag})`)

/**
 * The reasons a function stays on its deployed code that its configuration alone decides, or
 * null. `runtime` undefined means not known yet: the runtime checks are left out.
 */
const configRow = ({
  name,
  config,
  runtime,
  image,
  capacityProvider,
  timeoutSeconds,
}) => {
  if (isEdgeFunction(config)) {
    return row(name, 'deployed', 'edge_function', 'Lambda@Edge (not supported)')
  }
  if (image) {
    return row(
      name,
      'deployed',
      'container_image',
      'container image (Dev Mode support planned)',
    )
  }
  if (runtime !== undefined) {
    if (runtime.startsWith('provided')) {
      return row(
        name,
        'deployed',
        'os_only_runtime',
        `OS-only runtime ${runtime} (Dev Mode support planned)`,
      )
    }
    if (!adapterFor(runtime)) {
      return row(
        name,
        'deployed',
        'runtime_not_supported',
        `${runtimeLabel(runtime)} runtime (Dev Mode support planned)`,
      )
    }
  }
  const alias = aliasFeature(config)
  if (alias) {
    return row(
      name,
      'deployed',
      'alias_targeted',
      `${alias} (Dev Mode support planned)`,
    )
  }
  if (capacityProvider) {
    return row(
      name,
      'deployed',
      'managed_instances',
      'Managed Instances (Dev Mode support planned)',
    )
  }
  if (
    timeoutSeconds !== undefined &&
    timeoutSeconds < MIN_DEV_TIMEOUT_SECONDS
  ) {
    return row(
      name,
      'deployed',
      'timeout_too_short',
      `timeout of ${timeoutSeconds}s is too short to run on this machine`,
    )
  }
  return null
}

/**
 * A function whose runtime this machine has no usable interpreter for stays on its deployed code,
 * and so does one whose interpreter was never detected: the laptop runtime needs one to run it.
 * An adapter can ask more of the interpreter for some functions (`runsLocally`): an MCP server
 * (`mcp`) needs a newer Node.js than other Node.js functions.
 */
const localRow = ({ name, runtime, localRuntimes, mcp = false }) => {
  if (!runtime || !localRuntimes) return null
  const adapter = adapterFor(runtime)
  if (!adapter) return null
  const local = localRuntimes[adapter.name]
  if (local?.available && (adapter.runsLocally?.(local, { mcp }) ?? true)) {
    return null
  }
  return row(
    name,
    'deployed',
    'local_runtime_missing',
    adapter.missingWhy(runtime, local, { mcp }),
  )
}

/**
 * The artifact a function deploys from as serverless.yml configures it, or null: its own
 * `package.artifact`, else the service's when the function is not packaged individually (as
 * packaging decides). Read before anything is packaged: packaging sets an artifact on every
 * function it zips.
 */
export const configuredArtifactOf = ({ config, servicePackage }) => {
  const own = config?.package?.artifact
  if (own) return String(own)
  if (servicePackage?.artifact && !config?.package?.individually) {
    return String(servicePackage.artifact)
  }
  return null
}

export const HANDLER_NOT_IN_SERVICE_WHY =
  "its handler is only in package.artifact, not in this service's files"

/**
 * A function deployed from a prebuilt artifact (`artifact`) runs here from the service directory
 * like any other, so it stays on its deployed code when its handler is not there (the artifact
 * was built elsewhere). One whose source is in the service directory runs from that source.
 */
const artifactRow = ({ name, config, runtime, artifact, serviceDir }) => {
  if (!artifact || !runtime || !serviceDir) return null
  const adapter = adapterFor(runtime)
  if (!adapter?.hasHandler) return null
  try {
    if (adapter.hasHandler({ functionConfig: config, serviceDir })) return null
  } catch {
    return null
  }
  return row(
    name,
    'deployed',
    'handler_not_in_service',
    HANDLER_NOT_IN_SERVICE_WHY,
  )
}

/**
 * The mode a function gets from serverless.yml alone, before it is deployed: a `deployed` row
 * when its configuration already rules Dev Mode out, otherwise null (it may run in `dev` once
 * deployed). `runtime` is the resolved one (the function's, else the provider's, else the
 * Framework default); undefined leaves the runtime unchecked. `timeout` is the resolved one in
 * seconds (see resolvedTimeoutSeconds); undefined leaves it unchecked.
 * `localRuntimes` (from `detectLocalRuntimes`), when given, also rules out a runtime this
 * machine cannot run; `mcp` says the function is an MCP server, which needs a newer Node.js.
 * `artifact` (configuredArtifactOf) and `serviceDir`, when given, rule out a function deployed
 * from an artifact whose handler is not in the service directory.
 */
export const classifyByConfig = ({
  name,
  config: rawConfig,
  runtime,
  timeout,
  selection = { selected: true },
  localRuntimes,
  mcp = false,
  artifact = null,
  serviceDir,
}) => {
  const config = rawConfig ?? {}
  if (!selection.selected) return notSelectedRow(name, selection)
  const known =
    config.image || runtime === undefined ? undefined : String(runtime)
  return (
    configRow({
      name,
      config,
      runtime: known,
      image: Boolean(config.image),
      capacityProvider: Boolean(config.capacityProvider),
      timeoutSeconds: secondsOf(timeout),
    }) ??
    localRow({ name, runtime: known, localRuntimes, mcp }) ??
    artifactRow({ name, config, runtime: known, artifact, serviceDir })
  )
}

/**
 * Whether the session a function is attached to still holds it. A session that answers, or that
 * cannot answer in time (a sleeping or frozen machine), keeps its functions, yours included; one
 * that is gone holds nothing. When the check was denied or failed, or none was made, your own
 * sessions hold nothing and another developer's hold theirs. A session the check has no answer
 * for attached after this session looked, so it was running moments ago: it keeps them.
 */
export const isHeld = (liveness, session, mine) => {
  if (!liveness) return !mine
  const state = liveness.get(session)
  if (state === 'gone') return false
  if (state === 'denied' || state === 'failed') return !mine
  return true
}

/**
 * `context.liveness`, when given, is a `Map<sessionId, 'live'|'gone'|'unknown'|'denied'|'failed'>`
 * for the other sessions found on the service's functions. `context.mcp` says the function is an
 * MCP server.
 */
export const classifyFunction = ({
  name,
  config: rawConfig,
  live,
  context,
}) => {
  const config = rawConfig ?? {}
  const {
    selection = { selected: true },
    sessionId,
    owner,
    takeOver,
    attachVariables,
    localRuntimes,
    liveness,
    mcp = false,
    // The versions of Dev Mode's layer names that Dev Mode published (see publishedByDevMode).
    devModeLayerVersions = new Set(),
    // The artifact serverless.yml deploys the function from (configuredArtifactOf), and the
    // service directory its handler must be in then.
    artifact = null,
    serviceDir,
  } = context
  if (!selection.selected) return notSelectedRow(name, selection)
  if (!live) {
    return row(
      name,
      'skipped',
      'not_deployed',
      `not deployed yet (run ${cliCommand('deploy')})`,
    )
  }
  const variables = variablesOf(live)
  if (isLegacyShim(live, variables)) {
    return row(
      name,
      'skipped',
      'legacy_shim',
      `set up by an earlier version of Dev Mode (run ${cliCommand('deploy')} once)`,
    )
  }
  const configured = configRow({
    name,
    config,
    runtime: String(live.Runtime ?? ''),
    image: live.PackageType === 'Image' || Boolean(config.image),
    // In serverless.yml, or set on the function some other way (the live configuration says so too).
    capacityProvider: Boolean(
      config.capacityProvider || live.CapacityProviderConfig,
    ),
    // What the function runs with now, whatever serverless.yml says.
    timeoutSeconds: secondsOf(live.Timeout),
  })
  if (configured) return configured
  const missing = localRow({
    name,
    runtime: String(live.Runtime ?? ''),
    localRuntimes,
    mcp,
  })
  if (missing) return missing
  const artifactOnly = artifactRow({
    name,
    config,
    runtime: String(live.Runtime ?? ''),
    artifact,
    serviceDir,
  })
  if (artifactOnly) return artifactOnly
  const otherLayerArns = layerArnsOf(live).filter(
    (arn) => !isDevModeLayerArn(arn, { scope: live.FunctionArn }),
  )
  if (otherLayerArns.length >= 5) {
    return row(name, 'deployed', 'no_free_layer_slot', 'already uses 5 layers')
  }
  if (isEnvUnreadable(live)) {
    return row(name, 'deployed', 'env_unreadable', ENV_UNREADABLE_WHY)
  }
  const customEndpoints = customEndpointsOf(variables)
  if (customEndpoints.length) {
    return row(
      name,
      'deployed',
      'custom_aws_endpoints',
      `uses custom AWS endpoints (${customEndpoints.join(', ')})`,
    )
  }
  // A function Dev Mode never attached that sets a name of its undo record: attaching would
  // replace that value and restoring would delete it, so it keeps running the deployed code. The
  // names the Dev Mode wrapper and bridge read are never the function's to set, attached or not:
  // a value of its own (a port, say) would make the bridge fail while the session counts the
  // function in Dev Mode.
  const sameNamed = layerArnsOf(live).filter((arn) =>
    isDevModeLayerArn(arn, { scope: live.FunctionArn }),
  )
  const attachedByDevMode = isAttached({ variables })
  // A layer Dev Mode published, left without its wrapper and variables: what is left of them is
  // Dev Mode's too, and the attach replaces it all.
  const leftByDevMode =
    !attachedByDevMode &&
    sameNamed.length > 0 &&
    sameNamed.every((arn) => devModeLayerVersions.has(arn))
  const reserved = [
    ...(attachedByDevMode || leftByDevMode
      ? []
      : DEVMODE_VARIABLE_NAMES.filter((key) => variables[key] !== undefined)),
    ...WRAPPER_VARIABLE_NAMES.filter((key) => variables[key] !== undefined),
  ]
  if (reserved.length) {
    const names =
      reserved.length === 1
        ? reserved[0]
        : `${reserved.slice(0, -1).join(', ')} and ${reserved.at(-1)}`
    return row(
      name,
      'deployed',
      'reserved_variable',
      `sets ${names}, which Dev Mode uses (rename ${reserved.length === 1 ? 'it' : 'them'} to use Dev Mode)`,
    )
  }
  // A layer with Dev Mode's name on a function Dev Mode did not attach, and not one Dev Mode
  // published, is someone else's: attaching would replace it with Dev Mode's.
  const taken = !attachedByDevMode && !leftByDevMode && sameNamed[0]
  if (taken) {
    return row(
      name,
      'deployed',
      'layer_name_taken',
      `uses a layer named ${taken.split(':')[6]} without Dev Mode's settings (remove that layer from the function, or publish yours under another name, to use Dev Mode)`,
    )
  }
  if (!fitsEnvBudget(attachVariables(variables, otherLayerArns))) {
    return row(
      name,
      'deployed',
      'env_too_large',
      'its environment variables would exceed the 4 KB limit',
    )
  }
  const attachment = readAttachment(variables)
  const notes = []
  if (attachment && attachment.session !== sessionId) {
    const mine = attachment.owner === owner
    const held = isHeld(liveness, attachment.session, mine)
    if (held && !takeOver) {
      return row(
        name,
        'skipped',
        'owned_by_other_session',
        mine
          ? 'in Dev Mode in another session of yours (--take-over to take it)'
          : `in Dev Mode for ${attachment.owner} (--take-over to take it)`,
        { attachment },
      )
    }
    if (held) {
      notes.push({
        reason: 'taken_over',
        message: `taken over from ${mine ? 'another session of yours' : attachment.owner}`,
      })
    } else if (mine) {
      notes.push({
        reason: 'reattached',
        message: 'left in Dev Mode by an earlier session of yours',
      })
    } else {
      notes.push({
        reason: 'taken_over',
        message: `taken over from ${attachment.owner}, whose session has ended`,
      })
    }
  }
  if (live.VpcConfig?.SubnetIds?.length) {
    notes.push({
      reason: 'vpc_egress_required',
      message: 'needs outbound access to AWS IoT Core, STS and S3 (VPC)',
    })
  }
  return {
    function: name,
    mode: 'dev',
    notes,
    arch: live.Architectures?.[0] ?? 'x86_64',
    ...(attachment && { attachment }),
  }
}

/**
 * The Dev Mode-named layer versions on functions Dev Mode has not attached (no wrapper and no
 * complete undo record), whose variables are readable: what publishedByDevMode is asked about.
 */
export const unattachedDevModeLayers = (lives) =>
  [...lives]
    .filter(
      (live) =>
        live &&
        !isEnvUnreadable(live) &&
        !isAttached({ variables: variablesOf(live) }),
    )
    .flatMap((live) =>
      layerArnsOf(live).filter((arn) =>
        isDevModeLayerArn(arn, { scope: live.FunctionArn }),
      ),
    )

export const selectFunctions = ({ names, only = [], skip = [] }) => {
  const known = new Set(names)
  for (const name of [...only, ...skip]) {
    if (!known.has(name)) {
      throw new ServerlessError(
        `Function "${name}" is not in serverless.yml.`,
        'DEV_MODE_UNKNOWN_FUNCTION',
        { stack: false },
      )
    }
  }
  return new Map(
    names.map((name) => {
      if (only.length > 0 && !only.includes(name)) {
        return [name, { selected: false, flag: '--function' }]
      }
      if (skip.includes(name)) {
        return [name, { selected: false, flag: '--skip-function' }]
      }
      return [name, { selected: true }]
    }),
  )
}
