import ServerlessError from '../../../serverless-error.js'

const DEFAULT_MIN_PORT = 1
const DEFAULT_MAX_PORT = 65535

export default function validatePort(value, defaultPort) {
  if (value === undefined) return defaultPort

  const port = Number(value)
  if (
    !Number.isInteger(port) ||
    port < DEFAULT_MIN_PORT ||
    port > DEFAULT_MAX_PORT
  ) {
    throw new ServerlessError(
      `Invalid --port value '${value}'; expected an integer from 1 to 65535.`,
      'INVALID_DEV_PORT',
      { stack: false },
    )
  }
  return port
}
