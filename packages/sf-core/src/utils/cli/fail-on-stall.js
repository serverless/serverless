/**
 * Call onStall when Node.js runs out of work while the command is still
 * pending. That happens when the command waits on something that can never
 * finish, such as a network response that stopped arriving, and Node.js would
 * otherwise exit with code 0 as if the command had succeeded.
 *
 * Other 'beforeExit' listeners can still settle the command (invoke local
 * finishes a handler that never calls back this way, as Lambda does), so the
 * first time the event loop empties, the check waits one more turn and only
 * reports if the event loop empties again with the command still pending.
 *
 * @param {Promise} commandPromise - The running command
 * @param {Function} onStall - Called once if the command never settles
 */
export const failOnStall = (commandPromise, onStall) => {
  let settled = false
  let waitedOneTurn = false
  const markSettled = () => {
    settled = true
  }
  commandPromise.then(markSettled, markSettled)

  const onBeforeExit = () => {
    if (!settled && !waitedOneTurn) {
      waitedOneTurn = true
      setImmediate(() => {})
      return
    }
    process.removeListener('beforeExit', onBeforeExit)
    if (!settled) onStall()
  }
  process.on('beforeExit', onBeforeExit)
}
