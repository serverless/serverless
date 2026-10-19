'use strict'

import fs from 'fs'
import path from 'path'
import naming from '../../lib/naming.js'
import { getStageScopedName } from '../../lib/resource-naming.js'
import {
  getWebAppFunctionName,
  getWebAppLogicalIds,
} from '../compilers/function.js'
import {
  APPLICATION_LOG_LEVELS,
  AWS_RESERVED_ENV,
  BOOTSTRAP_FILE,
  FRAMEWORK_RESERVED_ENV,
  RATE_LIMIT_VALUES,
  RUNTIME_RULE,
  SYSTEM_LOG_LEVELS,
  URL_AUTHORIZERS,
} from '../constants.js'
import { isSupportedRuntime } from '../runtime.js'

const MAX_ENV_VALUE_CHARACTERS = 4096
const MAX_ENV_TOTAL_BYTES = 32768
const MIN_TIMEOUT = 3
const MAX_TIMEOUT = 900
const MIN_MAX_CONCURRENCY = 1
const MAX_MAX_CONCURRENCY = 128
const MIN_MAX_ENVIRONMENTS = 2

const awsReserved = new Set(AWS_RESERVED_ENV)
const frameworkReserved = new Set(FRAMEWORK_RESERVED_ENV)

const JS_TS_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
])

/**
 * A literal environment value. Objects and arrays are CloudFormation
 * intrinsics (or lists that resolve to one) whose value is only known at deploy
 * time, so the size checks skip them. Keys are always literal, so the
 * reserved-name checks cover every key.
 */
const isLiteral = (value) => value != null && typeof value !== 'object'

const literalEntries = (environment) =>
  Object.entries(environment || {}).filter(([, value]) => isLiteral(value))

/**
 * `entry` written like a function handler (`src/server.handler`): the part
 * after the last `.` of the file name is an identifier that is not a JS or TS
 * extension, and no file of that name exists in the service directory. Entries
 * of a `package.artifact` zip name a path inside the zip and are not checked.
 */
const looksLikeFileExport = (entry, serviceDir) => {
  const match = /\.([A-Za-z_$][\w$]*)$/.exec(path.basename(entry))
  if (!match || JS_TS_EXTENSIONS.has(match[1].toLowerCase())) return false
  return !fs.existsSync(path.resolve(serviceDir || '.', entry))
}

/**
 * `entry` as an absolute path or with a `..` segment, in POSIX or Windows
 * form: it cannot name a file inside the service directory (or the zip).
 */
const isOutsideServiceDir = (entry) =>
  path.posix.isAbsolute(entry) ||
  path.win32.isAbsolute(entry) ||
  entry.split(/[\\/]/).includes('..')

/**
 * Case-insensitive enum values, checked here as well as in the schema: the
 * schema's `regexp` keyword is not applied by the config-schema handler today.
 * A value that is not a string is rejected too: none of these fields takes an
 * intrinsic, and compilation reads each one as a string.
 */
const ENUM_FIELDS = [
  {
    path: 'logs.applicationLogLevel',
    get: (webApp) => webApp.logs?.applicationLogLevel,
    allowed: APPLICATION_LOG_LEVELS,
  },
  {
    path: 'logs.systemLogLevel',
    get: (webApp) => webApp.logs?.systemLogLevel,
    allowed: SYSTEM_LOG_LEVELS,
  },
  {
    path: 'url.authorizer',
    get: (webApp) => webApp.url?.authorizer,
    allowed: URL_AUTHORIZERS,
  },
]

function validateEnumValues(name, webApp) {
  const messages = []
  for (const { path: fieldPath, get, allowed } of ENUM_FIELDS) {
    const value = get(webApp)
    if (value == null) continue
    const normalized = allowed.map((v) => v.toLowerCase())
    if (
      typeof value !== 'string' ||
      !normalized.includes(value.toLowerCase())
    ) {
      messages.push(
        `webApps.${name}.${fieldPath} must be one of: ${normalized.join(', ')}.`,
      )
    }
  }
  return messages
}

/**
 * An object that is not a list: the shape of every web app and of its object
 * settings.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** A whole number from `min` to `max`, or a string that reads as one. */
const isWholeNumberIn = (value, min, max) => {
  if (typeof value !== 'number' && typeof value !== 'string') return false
  if (typeof value === 'string' && value.trim() === '') return false
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max
}

/** Lambda function names: letters, digits, `-` and `_`, up to 64 characters. */
const FUNCTION_NAME_PATTERN = /^[a-zA-Z0-9-_]{1,64}$/

/** A setting of `url` when `url` is an object of endpoint settings. */
const urlSetting = (key) => (webApp) =>
  isPlainObject(webApp.url) ? webApp.url[key] : undefined

/** `iam.role` when it is an object of role settings. */
const iamRoleOf = (webApp) =>
  isPlainObject(webApp.iam) && isPlainObject(webApp.iam.role)
    ? webApp.iam.role
    : undefined

/**
 * The value types of a web app's settings, as far as packaging and
 * compilation read them. Each check passes when the setting is unset; the
 * values inside these settings that only CloudFormation reads (intrinsics
 * among them) are left to deploy time.
 */
const VALUE_TYPE_RULES = [
  {
    field: 'url',
    // `false` has its own message
    isValid: (url) => url === true || url === false || isPlainObject(url),
    message: 'must be true or an object of endpoint settings.',
  },
  {
    field: 'environment',
    isValid: isPlainObject,
    message: 'must be an object of variable names and values.',
  },
  {
    field: 'vpc',
    isValid: isPlainObject,
    message: 'must be an object with securityGroupIds and subnetIds.',
  },
  {
    field: 'package',
    isValid: isPlainObject,
    message: 'must be an object with patterns or artifact.',
  },
  {
    field: 'package.patterns',
    get: (webApp) =>
      isPlainObject(webApp.package) ? webApp.package.patterns : undefined,
    isValid: (patterns) =>
      Array.isArray(patterns) &&
      patterns.every((pattern) => typeof pattern === 'string'),
    message: 'must be a list of glob patterns.',
  },
  {
    field: 'package.artifact',
    get: (webApp) =>
      isPlainObject(webApp.package) ? webApp.package.artifact : undefined,
    isValid: (artifact) => typeof artifact === 'string',
    message: 'must be the path of a zip file.',
  },
  {
    field: 'build',
    // `true` reaches here as "true" when the schema coerced it in warn mode
    isValid: (build) =>
      build === false || (typeof build === 'string' && build !== 'true'),
    message: 'must be false or the name of a build tool, for example esbuild.',
  },
  {
    field: 'logs',
    isValid: isPlainObject,
    message: 'must be an object, for example applicationLogLevel: info.',
  },
  {
    field: 'tags',
    isValid: isPlainObject,
    message: 'must be an object of tag names and values.',
  },
  {
    field: 'role',
    isValid: (role) => typeof role === 'string' || isPlainObject(role),
    message: 'must be a role name, a role ARN or a CloudFormation intrinsic.',
  },
  {
    field: 'iam',
    isValid: isPlainObject,
    message: 'must be an object, for example role: { statements: [...] }.',
  },
  {
    field: 'iam.role',
    get: (webApp) => (isPlainObject(webApp.iam) ? webApp.iam.role : undefined),
    isValid: isPlainObject,
    message: (name) =>
      `must be an object of role settings, for example statements. To use an existing role, set webApps.${name}.role.`,
  },
  {
    field: 'iam.role.statements',
    get: (webApp) => iamRoleOf(webApp)?.statements,
    isValid: Array.isArray,
    message: 'must be a list of IAM policy statements.',
  },
  {
    field: 'iam.role.managedPolicies',
    get: (webApp) => iamRoleOf(webApp)?.managedPolicies,
    isValid: Array.isArray,
    message: 'must be a list of managed policy ARNs.',
  },
  {
    field: 'name',
    isValid: (name) =>
      typeof name === 'string' && FUNCTION_NAME_PATTERN.test(name),
    message: 'must be letters, digits, - and _, up to 64 characters.',
  },
  {
    field: 'timeout',
    isValid: (timeout) => isWholeNumberIn(timeout, MIN_TIMEOUT, MAX_TIMEOUT),
    message: `must be a whole number of seconds from ${MIN_TIMEOUT} to ${MAX_TIMEOUT}.`,
  },
  {
    field: 'maxConcurrency',
    isValid: (value) =>
      isWholeNumberIn(value, MIN_MAX_CONCURRENCY, MAX_MAX_CONCURRENCY),
    message: `must be a whole number from ${MIN_MAX_CONCURRENCY} to ${MAX_MAX_CONCURRENCY}.`,
  },
  // An intrinsic passes through to the endpoint
  {
    field: 'url.maxEnvironments',
    get: urlSetting('maxEnvironments'),
    isValid: (value) =>
      isPlainObject(value) ||
      isWholeNumberIn(value, MIN_MAX_ENVIRONMENTS, Infinity),
    message: `must be a whole number of at least ${MIN_MAX_ENVIRONMENTS}.`,
  },
  {
    field: 'url.rateLimit',
    get: urlSetting('rateLimit'),
    isValid: (value) =>
      isPlainObject(value) ||
      (isWholeNumberIn(value, 0, Infinity) &&
        RATE_LIMIT_VALUES.includes(Number(value))),
    message:
      'must be 0, 100 to 1000 in steps of 100, or 2000 to 10000 in steps of 1000.',
  },
]

/**
 * Settings of a type packaging or compilation cannot read, checked here as
 * well as in the schema: with `configValidationMode: warn` (the default) or
 * `off`, a schema error does not stop the command, and such a value would
 * reach a step that throws, or compile a template that can never deploy.
 */
function validateValueTypes(name, webApp) {
  const messages = []
  for (const { field, get, isValid, message } of VALUE_TYPE_RULES) {
    const value = get ? get(webApp) : webApp[field]
    if (value == null || isValid(value)) continue
    messages.push(
      `webApps.${name}.${field} ${typeof message === 'function' ? message(name) : message}`,
    )
  }
  return messages
}

/**
 * The function keys of the serverless-iam-roles-per-function plugin, which
 * web apps don't take, with the key that replaces each. Checked here as well
 * as in the schema, because with `configValidationMode: warn` or `off` the role
 * code would still apply them.
 */
const OLDER_IAM_KEYS = {
  iamRoleStatements: 'iam.role.statements',
  iamRoleStatementsInherit: 'iam.inheritStatements',
  iamRoleStatementsName: 'iam.role.name',
  iamPermissionsBoundary: 'iam.role.permissionsBoundary',
}

/**
 * @param {string} name
 * @param {object} webApp
 * @param {boolean} iamRolesPerFunctionPluginLoaded - the external plugin
 *   replaces the Framework's per-function roles, and gives web apps none
 * @param {boolean} hasProviderStatements - `provider.iam.role.statements` is
 *   set; a web app's own role leaves them out unless it inherits them
 * @returns {string[]}
 */
function validateIam(
  name,
  webApp,
  iamRolesPerFunctionPluginLoaded,
  hasProviderStatements,
) {
  const messages = []
  for (const [key, replacement] of Object.entries(OLDER_IAM_KEYS)) {
    if (webApp[key] === undefined) continue
    messages.push(
      key === 'iamRoleStatements' && hasProviderStatements
        ? `webApps.${name}.${key} is not supported on web apps. Use webApps.${name}.${replacement}, and add webApps.${name}.iam.inheritStatements: true to keep provider.iam.role.statements.`
        : `webApps.${name}.${key} is not supported on web apps. Use webApps.${name}.${replacement}.`,
    )
  }
  if (webApp.iam != null && iamRolesPerFunctionPluginLoaded) {
    messages.push(
      `webApps.${name}.iam is not applied while the serverless-iam-roles-per-function plugin is loaded. Remove the plugin from plugins: the Framework gives functions and web apps roles of their own without it.`,
    )
  }
  return messages
}

/**
 * The message for a `webApps.<name>` value that is not an object, also used
 * by the commands that read one web app (`invoke`, `logs`).
 *
 * @param {string} name
 * @returns {string}
 */
export const getInvalidWebAppMessage = (name) =>
  `webApps.${name} must be an object with an entry file path.`

/**
 * `url: false` and an unsupported `runtime`, checked here as well as in the
 * schema: with `configValidationMode: warn` (the default) a schema error is
 * only a warning, and these values would otherwise deploy a public endpoint
 * the user asked not to have, or a template Lambda rejects. An intrinsic `url`
 * is left to deploy time; `runtime` must be literal, because packaging reads
 * it (esbuild picks the dependencies to leave out by Node.js version).
 */
function validateLiteralValues(name, webApp) {
  const messages = []
  if (webApp.url === false) {
    messages.push(
      `webApps.${name}.url cannot be false: every web app has an endpoint, and requests reach it only over HTTP. Remove url, or set url.authorizer: aws_iam to require signed requests.`,
    )
  }
  if (webApp.runtime != null && !isSupportedRuntime(webApp.runtime)) {
    messages.push(`webApps.${name}.runtime must be ${RUNTIME_RULE}.`)
  }
  return messages
}

function validateEnvironment(name, webApp, providerEnvironment) {
  const messages = []

  for (const key of Object.keys(webApp.environment || {})) {
    if (key === 'AWS_LAMBDA_NODEJS_ENTRYPOINT') {
      messages.push(
        `webApps.${name}.environment.${key} is set by the Framework from webApps.${name}.entry. Remove it and set entry instead.`,
      )
    } else if (frameworkReserved.has(key)) {
      messages.push(
        `webApps.${name}.environment.${key} is set by the Framework from the Lambda listen address. Remove it and read process.env.${key} in your server.`,
      )
    } else if (awsReserved.has(key)) {
      messages.push(
        `webApps.${name}.environment: ${key} is set by AWS Lambda and cannot be overridden.`,
      )
    }
  }

  for (const [key, value] of literalEntries(webApp.environment)) {
    const length = String(value).length
    if (length > MAX_ENV_VALUE_CHARACTERS) {
      messages.push(
        `webApps.${name}.environment.${key} is ${length} characters; CloudFormation allows ${MAX_ENV_VALUE_CHARACTERS} per value.`,
      )
    }
  }

  // Lambda limits the environment the web function receives: the entry's
  // values merged over provider.environment, plus the start file the Framework
  // sets (the bootstrap, or `entry` itself for a package.artifact zip).
  const merged = {
    ...providerEnvironment,
    ...webApp.environment,
    AWS_LAMBDA_NODEJS_ENTRYPOINT: webApp.package?.artifact
      ? webApp.entry
      : BOOTSTRAP_FILE,
  }
  const totalBytes = literalEntries(merged).reduce(
    (sum, [key, value]) => sum + Buffer.byteLength(`${key}${value}`),
    0,
  )
  if (totalBytes > MAX_ENV_TOTAL_BYTES) {
    messages.push(
      `webApps.${name}.environment is ${totalBytes} bytes; Lambda allows ${MAX_ENV_TOTAL_BYTES}.`,
    )
  }

  return messages
}

/**
 * Validate rules that need the whole service (the schema covers each entry's
 * shape). Returns every message; the caller throws them as one error.
 *
 * @param {object} params
 * @param {object} params.webApps - `webApps` block
 * @param {object} [params.functions] - `functions` block
 * @param {object} [params.provider] - `{ timeout, environment, iam }` as the user set them
 * @param {string} params.serviceName
 * @param {string} params.stage
 * @param {string} [params.serviceDir] - directory `entry` paths resolve against
 * @param {boolean} [params.iamRolesPerFunctionPluginLoaded] - whether the
 *   serverless-iam-roles-per-function plugin is loaded
 * @returns {string[]}
 */
export function validateWebApps({
  webApps,
  functions,
  provider = {},
  serviceName,
  stage,
  serviceDir,
  iamRolesPerFunctionPluginLoaded = false,
}) {
  const messages = []
  const functionNames = new Set(Object.keys(functions || {}))
  const providerTimeout =
    provider.timeout == null ? null : Number(provider.timeout)
  const providerStatements = provider.iam?.role?.statements
  const hasProviderStatements =
    Array.isArray(providerStatements) && providerStatements.length > 0

  // The Lambda function name each function is deployed as: its `name`, or the
  // default the Framework gives it
  const functionLambdaNames = Object.entries(functions || {}).map(
    ([key, fn]) => [key, fn?.name ?? `${serviceName}-${stage}-${key}`],
  )

  if (webApps != null && !isPlainObject(webApps)) {
    return [
      'webApps must be an object with one entry per web app, for example api: { entry: src/server.js }.',
    ]
  }

  for (const [name, webApp] of Object.entries(webApps || {})) {
    if (!isPlainObject(webApp)) {
      messages.push(getInvalidWebAppMessage(name))
      continue
    }

    if (typeof webApp.entry !== 'string' || webApp.entry === '') {
      messages.push(
        `webApps.${name}.entry must be a file path, for example src/server.js.`,
      )
    }
    messages.push(...validateValueTypes(name, webApp))
    messages.push(
      ...validateIam(
        name,
        webApp,
        iamRolesPerFunctionPluginLoaded,
        hasProviderStatements,
      ),
    )

    if (functionNames.has(name)) {
      messages.push(
        `webApps.${name} and functions.${name} use the same name, so both would be deployed as the Lambda function "${getStageScopedName(serviceName, stage, name)}". Rename one of them.`,
      )
    }

    const lambdaName = getWebAppFunctionName(
      { serviceName, stage },
      name,
      webApp,
    )
    for (const [functionKey, functionLambdaName] of functionLambdaNames) {
      // The same key is reported above
      if (functionKey === name || functionLambdaName !== lambdaName) continue
      messages.push(
        `webApps.${name} and functions.${functionKey} use the same Lambda function name, so both would be deployed as the Lambda function "${lambdaName}". Rename one of them.`,
      )
    }

    // A web app's resources are named <Key>WebFunction<suffix>, so function
    // apiWebFunction gets web app api's log group ID, and with roles of their
    // own, its role ID. The web app's resource would replace the function's.
    const webAppLogicalIds = new Set(Object.values(getWebAppLogicalIds(name)))
    for (const functionKey of functionNames) {
      const logicalId = naming.getLogGroupLogicalId(functionKey)
      if (!webAppLogicalIds.has(logicalId)) continue
      messages.push(
        `webApps.${name} and functions.${functionKey} would both use the CloudFormation logical ID ${logicalId}, so one's resources would replace the other's. Rename one of them.`,
      )
    }

    if (typeof webApp.entry === 'string' && isOutsideServiceDir(webApp.entry)) {
      messages.push(
        `webApps.${name}.entry must be a path inside the service directory, for example src/server.js.`,
      )
    } else if (
      typeof webApp.entry === 'string' &&
      !webApp.package?.artifact &&
      looksLikeFileExport(webApp.entry, serviceDir)
    ) {
      messages.push(
        `webApps.${name}.entry "${webApp.entry}" looks like a function handler (file.export). A web app starts from a file: set entry to the file that starts your HTTP server, for example src/server.js.`,
      )
    }

    if (
      webApp.timeout == null &&
      Number.isFinite(providerTimeout) &&
      (providerTimeout < MIN_TIMEOUT || providerTimeout > MAX_TIMEOUT)
    ) {
      messages.push(
        `webApps.${name} inherits provider.timeout (${provider.timeout} seconds), and web functions accept 3–900. Set webApps.${name}.timeout.`,
      )
    }

    messages.push(...validateLiteralValues(name, webApp))
    messages.push(...validateEnumValues(name, webApp))
    if (webApp.environment == null || isPlainObject(webApp.environment)) {
      messages.push(...validateEnvironment(name, webApp, provider.environment))
    }
  }

  return messages
}
