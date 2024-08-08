import { ObservabilityProvider } from '@serverlessinc/sf-core/src/lib/observability/index.js'
import { determineObservabilityProviderFromConfig } from '../index.js'

/**
 * Checks if observability is configured AND enabled
 * @param {Object} configurationInput - The configuration input object.
 * @param {string} stageName - The current stage name.
 * @returns {boolean} - True if Dashboard observability is enabled, false otherwise.
 */
export function isDashboardObservabilityEnabled(configurationInput, stageName) {
  return (
    determineObservabilityProviderFromConfig(configurationInput, stageName) ===
    ObservabilityProvider.DASHBOARD
  )
}
