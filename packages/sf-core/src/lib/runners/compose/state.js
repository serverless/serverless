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
  let serviceUniqueId
  try {
    ;({ serviceUniqueId } = await runner.getServiceUniqueId())
  } catch (err) {
    // A not-yet-deployed dependency has no stack — during a get-state pass
    // getServiceUniqueId throws a STACK_DOES_NOT_EXIST-coded sentinel (see
    // getServiceUniqueId in runners/framework.js). That is the expected
    // "no state" case, not a failure, so treat it like empty state and return
    // undefined. Re-throw anything else — throttling, auth, or an unrelated
    // "does not exist" (S3 bucket, org) — so real errors are not swallowed.
    if (err?.code === 'STACK_DOES_NOT_EXIST') {
      logger.debug('No state found (stack does not exist)')
      return
    }
    throw err
  }
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
