import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'

/**
 * Checks if observability is configured AND enabled
 * @param {Object} configurationInput - The configuration input object.
 * @param {string} stageName - The current stage name.
 * @returns {boolean} - True if Dashboard observability is enabled, false otherwise.
 */
export function isDashboardObservabilityEnabled(configurationInput, stageName) {
  let observabilityEnabled = false

  if (typeof configurationInput.stages?.default?.observability === 'boolean') {
    observabilityEnabled = configurationInput.stages?.default?.observability
  } else if (
    typeof configurationInput.stages?.default?.observability === 'string'
  ) {
    observabilityEnabled =
      configurationInput.stages?.default?.observability === 'dashboard'
  }

  if (
    configurationInput.stages &&
    typeof configurationInput.stages[stageName]?.observability === 'boolean'
  ) {
    observabilityEnabled = configurationInput.stages[stageName]?.observability
  } else if (
    configurationInput.stages &&
    typeof configurationInput.stages[stageName]?.observability === 'string'
  ) {
    observabilityEnabled =
      configurationInput.stages[stageName]?.observability === 'dashboard'
  }

  if (observabilityEnabled && !configurationInput.app) {
    throw new ServerlessError(
      'To instrument your service, you must set the "app" property in your config file.',
      'OBSERVABILITY_APP_NOT_SET',
    )
  }

  return observabilityEnabled
}
