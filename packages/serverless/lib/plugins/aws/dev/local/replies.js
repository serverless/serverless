/**
 * The replies an invocation gets from this machine when its handler did not answer itself, in
 * Lambda's words.
 */
export const errorReply = (errorType, errorMessage, kind = 'error') => ({
  kind,
  errorType,
  body: Buffer.from(JSON.stringify({ errorType, errorMessage })),
})

/** What Lambda answers for an invocation that ran past its deadline. */
export const TIMED_OUT = 'Sandbox.Timedout'
export const timeoutMessage = (requestId, seconds) =>
  `RequestId: ${requestId} Error: Task timed out after ${seconds.toFixed(2)} seconds`

/**
 * What an invocation gets when its worker exits under it, in Lambda's words. A worker that exits
 * before it ever took an invocation failed its init (a module whose top-level await never settles
 * makes Node.js exit 0 there), so the invocation fails as an init error rather than an error.
 */
export const exitReply = ({ requestId, code, signal, kind }) =>
  errorReply(
    'Runtime.ExitError',
    `RequestId: ${requestId} Error: Runtime exited with error: ${
      signal ? `signal: ${signal}` : `exit status ${code ?? 'unknown'}`
    }`,
    kind,
  )

export const parseEvent = (buffer) => {
  try {
    return JSON.parse(Buffer.from(buffer ?? '').toString('utf8'))
  } catch {
    return undefined
  }
}
