import { log } from '@serverless/util'
import { getRunner } from '../../router.js'

/**
 * @typedef {Object} ResolveConfigAndGetStateParams
 * @property {Object} options - CLI options.
 * @property {Object} versions - Versions of the framework.
 * @property {State} state - State object.
 * @property {Object} compose - Compose object.
 */

/**
 * Resolves the configuration and gets the state.
 *
 * @param {ResolveConfigAndGetStateParams} params - The parameters for resolving config and getting state.
 * @returns {Promise<Object|null>} - The resolved state and meta information.
 */
export const resolveConfigAndGetState = async ({
  command,
  options,
  compose,
  state,
}) => {
  const logger = log.get('core:compose:state')
  const { runner } = await getRunner({
    logger,
    command,
    options,
    compose,
  })
  const { serviceUniqueId } = await runner.getServiceUniqueId()
  logger.debug(
    `Fetching state for service: ${serviceUniqueId} of type ${runner.constructor.runnerType}`,
  )
  const fetchedState = await state?.getServiceState({
    serviceUniqueId,
    runnerType: runner.constructor.runnerType,
  })
  if (!fetchedState) {
    logger.debug('No state found')
    return
  }
  logger.debug('Resolved state', fetchedState)
  return { state: fetchedState }
}
