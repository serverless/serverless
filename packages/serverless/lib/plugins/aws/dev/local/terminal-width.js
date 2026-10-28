/**
 * The width the session's lines and the commands' tables keep within: the terminal's, when both
 * output streams are one (0 otherwise: nothing is cut in a pipe or a log file).
 */
export const terminalWidth = (processRef = process) =>
  processRef.stdout?.isTTY && processRef.stderr?.isTTY
    ? Number(processRef.stderr.columns) || 0
    : 0
