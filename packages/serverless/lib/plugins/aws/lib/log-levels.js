'use strict'

/** Lambda's `ApplicationLogLevel` values. Configuration accepts them in any case. */
export const APPLICATION_LOG_LEVELS = [
  'TRACE',
  'DEBUG',
  'INFO',
  'WARN',
  'ERROR',
  'FATAL',
]

/** Lambda's `SystemLogLevel` values. Configuration accepts them in any case. */
export const SYSTEM_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN']

/**
 * A JSON Schema `pattern` that matches one of `values` in any case. It uses the standard `pattern`
 * keyword, which the config validator always applies, and spells each letter as a character class
 * because `pattern` takes no flags.
 *
 * @param {string[]} values
 * @returns {string}
 */
export const anyCasePattern = (values) =>
  `^(?:${values
    .map((value) =>
      value.replace(/[a-z]/gi, (c) => `[${c.toUpperCase()}${c.toLowerCase()}]`),
    )
    .join('|')})$`

/** The allowed values of a log level setting, by the setting's key. */
export const LOG_LEVELS_BY_KEY = {
  applicationLogLevel: APPLICATION_LOG_LEVELS,
  systemLogLevel: SYSTEM_LOG_LEVELS,
}

const upperCase = (level) =>
  typeof level === 'string' ? level.toUpperCase() : level

/**
 * The log levels a function or web app runs with: each level from the entry's own `logs`, else
 * from `provider.logs.lambda`, upper-cased as Lambda takes them. An unset level is `undefined`.
 *
 * @param {object} [entryLogs] - the function's or web app's `logs`
 * @param {object} [providerLambdaLogs] - `provider.logs.lambda`
 * @returns {{ applicationLogLevel?: string, systemLogLevel?: string }}
 */
export function resolveLogLevels(entryLogs, providerLambdaLogs) {
  return {
    applicationLogLevel: upperCase(
      entryLogs?.applicationLogLevel || providerLambdaLogs?.applicationLogLevel,
    ),
    systemLogLevel: upperCase(
      entryLogs?.systemLogLevel || providerLambdaLogs?.systemLogLevel,
    ),
  }
}
