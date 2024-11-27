import { ObservabilityProvider } from '@serverlessinc/sf-core/src/lib/observability/index.js'
import ServerlessError from '@serverlessinc/sf-core/src/utils/errors/serverlessError.js'
import yaml from 'js-yaml'

/**
 * Checks if observability is configured, which may or may not be enabled
 * @param {Object} configurationInput The configuration input object
 * @param {string} stageName The current stage name
 * @returns {string|null} The configured observability provider or null
 */
export function determineObservabilityProviderFromConfig(
  configurationInput,
  stageName,
) {
  let observabilityProvider = null

  if (!configurationInput.stages) {
    return null
  }

  const stageObservability = configurationInput.stages[stageName]?.observability
  const defaultObservability = configurationInput.stages.default?.observability

  observabilityProvider = determineStageSpecificObservabilityProvider(
    stageObservability,
    configurationInput.app,
  )
  if (!observabilityProvider) {
    observabilityProvider = determineStageSpecificObservabilityProvider(
      defaultObservability,
      configurationInput.app,
    )
  }
  return observabilityProvider
}

/**
 * Returns the observability provider based on the observability configuration
 * @param {boolean|string|Object} observability The observability configuration
 * @param {Object} app The app name
 * @returns {string|null} The observability provider
 */
function determineStageSpecificObservabilityProvider(observability, app) {
  if (observability === null || observability === undefined) return null

  const knownProviders = {
    axiom: ObservabilityProvider.AXIOM,
    dashboard: ObservabilityProvider.DASHBOARD,
    disabled: ObservabilityProvider.DISABLED,
  }

  let providerName

  if (typeof observability === 'string') {
    providerName = observability.toLowerCase()
  } else if (typeof observability === 'boolean') {
    if (!app) {
      throw new ServerlessError(
        'To instrument your service, you must set the "app" property in your config file.',
        'OBSERVABILITY_APP_NOT_SET',
      )
    }
    if (observability === true) {
      providerName = ObservabilityProvider.DASHBOARD
    } else {
      providerName = ObservabilityProvider.DISABLED
    }
  } else if (
    typeof observability === 'object' &&
    typeof observability.provider === 'string'
  ) {
    providerName = observability.provider.toLowerCase()
  }

  if (providerName) {
    const provider = knownProviders[providerName] || null
    if (!provider) {
      throw new ServerlessError(
        `Unknown observability provider: ${providerName}`,
        'UNKNOWN_OBSERVABILITY_PROVIDER',
      )
    }
    return provider
  }

  throw new ServerlessError(
    `Invalid observability configuration. Expected a boolean, string or an object with a "provider" property. Received: ${yaml.dump(observability)}`,
    'INVALID_OBSERVABILITY_CONFIGURATION',
  )
}
