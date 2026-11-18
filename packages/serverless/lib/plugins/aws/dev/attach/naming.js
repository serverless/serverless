import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Turns a function's deployed name into its key in `service` (serverless.yml), the name every
 * line shows; a name that is not one of the service's stays as it is.
 */
export const functionKeyOf = (service) => {
  const keys = new Map(
    service
      .getAllFunctions()
      .map((key) => [service.getFunction(key).name, key]),
  )
  return (name) => keys.get(name) ?? name
}

/** Lambda architectures Dev Mode ships a layer zip for. */
export const ARCHITECTURES = Object.freeze(['x86_64', 'arm64'])

/** Whether `moduleDir` is the released CLI's bundle directory, `<package>/dist`. */
export const isReleasedBundleDir = (moduleDir) => moduleDir.endsWith('dist')

/** Whether this running CLI is the released bundle rather than a source checkout. */
export const runsFromReleasedBundle = () =>
  isReleasedBundleDir(path.dirname(fileURLToPath(import.meta.url)))

/**
 * Where the layer zip for `arch` lives, seen from the module directory `moduleDir`.
 *
 * In the source tree the zips sit in `dev/layer/dist/` next to this `dev/attach/` module. In the
 * released CLI every module runs from the bundle in `<package>/dist`, and the release copies the
 * zips to the source-tree layout under `<package>/lib/...`
 * (`packages/sf-core/scripts/prepareDistributionTarballs.js`), so the bundle directory is mapped
 * back onto that layout. The copy step and the release check call this same function, so the
 * three cannot drift.
 */
export const layerArtifactPathFrom = (moduleDir, arch) =>
  path.join(
    isReleasedBundleDir(moduleDir)
      ? path.join(moduleDir, '../lib/plugins/aws/dev/attach')
      : moduleDir,
    '../layer/dist',
    `serverless-dev-${arch}.zip`,
  )

/** The layer zip for `arch` for this running CLI. */
export const layerArtifactPath = (arch) =>
  layerArtifactPathFrom(path.dirname(fileURLToPath(import.meta.url)), arch)

/** The exec wrapper the Dev Mode layer ships. */
export const WRAPPER_PATH = '/opt/sls-dev-wrapper'
export const EXEC_WRAPPER = 'AWS_LAMBDA_EXEC_WRAPPER'

/**
 * Every variable Dev Mode ever writes to a function: its undo record. Restore deletes exactly
 * these names, never a prefix — Dashboard uses SLS_DEV_MODE_ORG_ID and SLS_DEV_TOKEN, and owns the
 * SLS_DEV_MODE_ family, so no name here may start with it. The names
 * outlive every CLI version once functions carry them: never rename one, only add.
 */
export const ENV = Object.freeze({
  VERSION: 'SLS_DEV_VERSION',
  SESSION: 'SLS_DEV_SESSION',
  OWNER: 'SLS_DEV_OWNER',
  ATTACHED_AT: 'SLS_DEV_ATTACHED_AT',
  ORIGINAL_WRAPPER: 'SLS_DEV_ORIGINAL_EXEC_WRAPPER',
  ORIGINAL_WRAPPER_LAYER: 'SLS_DEV_ORIGINAL_EXEC_WRAPPER_LAYER',
  LAYERS_AT_ATTACH: 'SLS_DEV_LAYERS_AT_ATTACH',
  BROKER_ROLE_ARN: 'SLS_DEV_BROKER_ROLE_ARN',
  BROKER_EXTERNAL_ID: 'SLS_DEV_BROKER_EXTERNAL_ID',
  // The relay's: the per-session AES-256-GCM key (base64) and the AWS IoT Core data endpoint.
  SESSION_KEY: 'SLS_DEV_SESSION_KEY',
  IOT_ENDPOINT: 'SLS_DEV_IOT_ENDPOINT',
  // A web app's Dev Mode revisions: the revision `main` goes back to, the revision's role
  // (`dev`, the bridge; `clone`, the copy of the deployed revision the fallback endpoint serves)
  // and the fallback endpoint's URL.
  RESTORE_REVISION: 'SLS_DEV_RESTORE_REVISION',
  REVISION_ROLE: 'SLS_DEV_REVISION_ROLE',
  FALLBACK_URL: 'SLS_DEV_FALLBACK_URL',
  // The fallback endpoint's auth type, `main`'s: `ApplicationManaged` (forwarded unsigned) or
  // `IamAuth` (signed), and the web function's name (AWS sets no variable with it).
  FALLBACK_AUTH: 'SLS_DEV_FALLBACK_AUTH',
  WEB_FUNCTION: 'SLS_DEV_WEB_FUNCTION',
})
export const DEVMODE_VARIABLE_NAMES = Object.freeze(Object.values(ENV))
/** What the exec wrapper exports to the bridge process; never part of a function's configuration. */
export const WRAPPER_VARIABLE_NAMES = Object.freeze([
  'SLS_DEV_REAL_RUNTIME_API',
  'SLS_DEV_BRIDGE_PORT',
])
export const UNDO_RECORD_VERSION = '1'

/**
 * A web app's Dev Mode endpoints: the fallback serves the clone of the deployed revision (requests
 * the machine does not take); the local one serves the dev revision of a `--local-only` web app.
 */
export const FALLBACK_ENDPOINT = 'sls-dev-fallback'
export const LOCAL_ENDPOINT = 'sls-dev-local'
export const DEV_MODE_ENDPOINTS = Object.freeze([
  FALLBACK_ENDPOINT,
  LOCAL_ENDPOINT,
])
/** Lambda Web's limit: 32,768 bytes of the UTF-8 JSON of a revision's environment variables. */
export const WEB_ENV_LIMIT_BYTES = 32_768
/** The bridge file a web app's dev revision starts (`AWS_LAMBDA_NODEJS_ENTRYPOINT`). */
export const WEB_BRIDGE_ENTRY = 'sls-dev-web-bridge.mjs'
/**
 * The path the CLI requests on a `--local-only` web app's endpoint `sls-dev-local` so that its dev
 * revision hands over the role credentials: the relay answers it itself (204), it never reaches the
 * local server, and it is never recorded.
 */
export const CREDENTIALS_PATH = '/__serverless-dev/credentials'
/** The licences of the third-party code WEB_BRIDGE_ENTRY bundles, next to it in the zip. */
export const WEB_BRIDGE_NOTICES = 'sls-dev-THIRD_PARTY_NOTICES'
/**
 * The zip that holds WEB_BRIDGE_ENTRY and WEB_BRIDGE_NOTICES at its root: a web app's dev
 * revision's code.
 */
export const WEB_BRIDGE_ZIP = 'sls-dev-web-bridge.zip'

/**
 * Where the web bridge zip lives, seen from the module directory `moduleDir`: in the source tree
 * `dev/web/bridge/dist/` (`npm run build:devmode:web-bridge -w @serverless/framework`), in the
 * released CLI the same layout under `<package>/lib/...`, as for the layer zips.
 */
export const webBridgeArtifactPathFrom = (moduleDir) =>
  path.join(
    isReleasedBundleDir(moduleDir)
      ? path.join(moduleDir, '../lib/plugins/aws/dev/attach')
      : moduleDir,
    '../web/bridge/dist',
    WEB_BRIDGE_ZIP,
  )

/** The web bridge zip for this running CLI. */
export const webBridgeArtifactPath = () =>
  webBridgeArtifactPathFrom(path.dirname(fileURLToPath(import.meta.url)))

/** Lambda's limit: 4096 bytes of the compact JSON of the variables map. */
export const ENV_LIMIT_BYTES = 4096

/**
 * The broker's inline permission policy: one fixed name, with its version in the content (every
 * statement id starts with `DevModeBrokerV<version>`). A policy of an older version, or one that
 * differs from what this version writes, is overwritten in place; one a newer version wrote is
 * left as it is, so a newer CLI's bridges keep what they need. A newer version must therefore keep
 * every permission an older CLI's bridges use. Every statement id is `DevModeBrokerV<version>`
 * followed by a name of letters and digits that starts with a capital letter.
 */
export const BROKER_POLICY_NAME = 'serverless-dev-broker'
export const BROKER_POLICY_VERSION = 2
export const BROKER_TRUST_SID = 'ServerlessDevModeBridge'

const TEST_SUFFIX = /^[a-z0-9]{1,12}$/
/** Undocumented: live tests suffix the account-level names so they can delete what they create. */
export const testSuffix = (env = process.env) =>
  TEST_SUFFIX.test(env.SLS_DEV_TEST_SUFFIX ?? '')
    ? `-${env.SLS_DEV_TEST_SUFFIX}`
    : ''
export const layerName = (arch, env) =>
  `serverless-dev-${arch}${testSuffix(env)}`
const BROKER_ROLE_PREFIX = 'serverless-dev-broker-'
/** IAM role names are account-global, so the region is part of the name. */
export const brokerRoleName = (region, env) =>
  `${BROKER_ROLE_PREFIX}${region}${testSuffix(env)}`

/** The ARN of the broker role `name` under the IAM path `path` in `identity`'s account. */
export const brokerRoleArn = ({ identity, name, path = '/' }) =>
  `arn:${identity.partition}:iam::${identity.accountId}:role${path}${name}`

/**
 * The resource that covers the broker role of every region under any IAM path (in an IAM
 * resource `*` also matches `/`), as the documented developer policy names it. Without an
 * identity, the account id is a placeholder.
 */
export const brokerRolePattern = (identity) =>
  `arn:${identity?.partition ?? 'aws'}:iam::${identity?.accountId ?? '<account-id>'}:role/*${BROKER_ROLE_PREFIX}*`

const LAYER_ARN = /^arn:([^:]+):lambda:([^:]+):([0-9]{12}):layer:([^:]+):\d+$/
const SCOPE_ARN = /^arn:([^:]+):lambda:([^:]+):([0-9]{12}):/

/**
 * Whether a layer version is one of Dev Mode's: exactly `serverless-dev-x86_64` or
 * `serverless-dev-arm64` (with the live tests' suffix only while that suffix is set), and, given a
 * `scope` (the function's ARN, or a Dev Mode layer ARN of this account and region), in the same
 * partition, region and account. A layer of that name shared from another account, or one with
 * another suffix, is someone else's: it is never removed or replaced.
 */
export const isDevModeLayerArn = (arn, { scope, env } = {}) => {
  const match = LAYER_ARN.exec(String(arn ?? ''))
  if (!match) return false
  const [, partition, region, account, name] = match
  if (name !== layerName('x86_64', env) && name !== layerName('arm64', env)) {
    return false
  }
  const own = SCOPE_ARN.exec(String(scope ?? ''))
  return (
    !own || (own[1] === partition && own[2] === region && own[3] === account)
  )
}

/** Refused for everyone, with no override flag: Dev Mode rewrites live function configuration. */
export const PROTECTED_STAGES = Object.freeze(['prod', 'production'])
export const isProtectedStage = (stage) =>
  PROTECTED_STAGES.includes(String(stage ?? '').toLowerCase())
