/**
 * Shape a runner command's returned state.
 *
 * A command's state is authoritative only when the run actually gathered
 * stack outputs (the aws:info flow, spawned by deploy and info). Commands
 * that gathered nothing return undefined — NOT an empty object — so
 * consumers (compose's updateLocalState) fall back to the persisted state
 * instead of mistaking "nothing gathered" for "the service has no outputs".
 * remove is the one intentional clear: an explicit empty state.
 *
 * @param {Object} params
 * @param {Record<string, string>|undefined} params.stackOutputs
 * @param {string} params.fullCommand - command.join(' ')
 * @returns {{outputs: Record<string, string>}|Record<string, never>|undefined}
 */
export const buildCommandState = ({ stackOutputs, fullCommand }) => {
  if (fullCommand === 'remove') {
    return {}
  }
  return stackOutputs ? { outputs: stackOutputs } : undefined
}
