'use strict'

/**
 * Environment variable names AWS Lambda sets itself and rejects in a web
 * function's environment (Lambda Web Functions developer guide).
 */
export const AWS_RESERVED_ENV = [
  'AWS_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SECRET_KEY',
  'AWS_SECURITY_TOKEN',
  'AWS_SESSION_TOKEN',
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  'AWS_LAMBDA_HTTP_ENDPOINT',
  'AWS_LAMBDA_RUNTIME_API',
  'AWS_LAMBDA_INITIALIZATION_TYPE',
  'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
  'AWS_LAMBDA_METADATA_API',
  'AWS_LAMBDA_METADATA_TOKEN',
]

/**
 * Environment variable names the Framework sets for a web app: `PORT` and
 * `HOSTNAME` from the bootstrap at startup, `AWS_LAMBDA_NODEJS_ENTRYPOINT`
 * from `entry`.
 */
export const FRAMEWORK_RESERVED_ENV = [
  'PORT',
  'HOSTNAME',
  'AWS_LAMBDA_NODEJS_ENTRYPOINT',
]

/**
 * `url.rateLimit` values Lambda accepts: 0, 100 to 1000 in steps of 100, and
 * 2000 to 10000 in steps of 1000.
 */
export const RATE_LIMIT_VALUES = [
  0,
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 100),
  ...Array.from({ length: 9 }, (_, i) => (i + 2) * 1000),
]

/** `logs.applicationLogLevel` and `logs.systemLogLevel` values (case-insensitive in config), as for functions. */
export { APPLICATION_LOG_LEVELS, SYSTEM_LOG_LEVELS } from '../lib/log-levels.js'

/** `url.authorizer` values (case-insensitive in config). */
export const URL_AUTHORIZERS = ['aws_iam']

/**
 * The runtime a web app gets without `runtime`, unless `provider.runtime` is
 * nodejs24.x or newer.
 */
export const DEFAULT_RUNTIME = 'nodejs24.x'

/** The oldest Node.js major version Lambda Web Functions run. */
export const MIN_NODE_MAJOR_VERSION = 24

/**
 * A regular expression source matching a decimal number of two or more
 * digits that is at least `min` (two digits, 10-99), without leading zeros.
 */
const atLeast = (min) => {
  const tens = Math.floor(min / 10)
  const ones = min % 10
  return [
    ones === 0 ? `${tens}[0-9]` : `${tens}[${ones}-9]`,
    ...(tens < 9 ? [`[${tens + 1}-9][0-9]`] : []),
    '[1-9][0-9]{2,}',
  ].join('|')
}

/**
 * Lambda's Node.js runtime identifiers (`nodejs<major>.x`) for
 * `MIN_NODE_MAJOR_VERSION` and newer, so a newer version works as soon as
 * Lambda supports it.
 */
export const RUNTIME_PATTERN = `^nodejs(${atLeast(MIN_NODE_MAJOR_VERSION)})\\.x$`

/** What `runtime` accepts, as the validation messages say it. */
export const RUNTIME_RULE = `nodejs${MIN_NODE_MAJOR_VERSION}.x or newer (nodejsNN.x)`

/** The generated start file at the root of each web app zip. */
export const BOOTSTRAP_FILE = '__sls_web_bootstrap.mjs'

/** Package-directory subdirectory that holds the web app zips. */
export const WEB_APPS_DIR = 'webapps'

/** `kind` for the shared content-addressed artifact helpers. */
export const MANIFEST_KIND = 'webapps'
