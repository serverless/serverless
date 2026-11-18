/**
 * An error for the user. With `{ stack: false }` it has no stack trace and prints as its message
 * alone, as the `ServerlessError` of `@serverless/util` does: for an error whose message says what
 * to fix (a configuration or usage error). Without it, the stack trace prints too.
 */
class ServerlessError extends Error {
  constructor(message, code, options = {}) {
    super(message)
    this.code = code
    if (options?.stack === false) {
      this.stack = undefined
    }
  }
}

Object.defineProperty(ServerlessError.prototype, 'name', {
  value: ServerlessError.name,
  configurable: true,
  writable: true,
})

export default ServerlessError
