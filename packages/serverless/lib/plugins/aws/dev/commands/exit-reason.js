/**
 * Why a Dev Mode command ended with a non-zero exit code without throwing (exit 3), as a CLI error
 * code. The CLI reports it as the code of the command's analysis event, which has no error of its
 * own otherwise. It changes nothing the command prints, its exit code or its `--json` envelope.
 */
export const EXIT_REASONS = Object.freeze({
  // Some function or web app could not be attached; everything attached was restored.
  ATTACH_INCOMPLETE: 'DEV_MODE_ATTACH_INCOMPLETE',
  // Some function or web app could not be restored.
  RESTORE_INCOMPLETE: 'DEV_MODE_RESTORE_INCOMPLETE',
  // The restore ran past its time limit: the session exited with something still attached.
  RESTORE_TIMEOUT: 'DEV_MODE_RESTORE_TIMEOUT',
  // A second Ctrl+C or SIGTERM ended the session with something still attached.
  FORCED_STOP: 'DEV_MODE_FORCED_STOP',
})

// The end reasons (`endReasonOf`, and a result's `reason`) that make the exit code 3.
const BY_REASON = Object.freeze({
  attach_incomplete: EXIT_REASONS.ATTACH_INCOMPLETE,
  restore_incomplete: EXIT_REASONS.RESTORE_INCOMPLETE,
})

/** The exit reason for an end reason or a result's `reason`; undefined for any other. */
export const exitReasonFor = (reason) =>
  Object.hasOwn(BY_REASON, reason ?? '') ? BY_REASON[reason] : undefined

/**
 * Records on `serverless` why the command ends with `exitCode` (`reason`: an end reason or a
 * result's `reason`), for the CLI's analysis event; a zero exit code records none.
 */
export const recordExitReason = (serverless, exitCode, reason) => {
  if (!serverless) return
  serverless.exitReason = exitCode ? exitReasonFor(reason) : undefined
}
