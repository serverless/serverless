import { randomBytes } from 'node:crypto'

/**
 * Generates a UUID v4 string
 * @returns {string} UUID string
 */
export function generateUUID() {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return bytes
    .toString('hex')
    .match(/(.{8})(.{4})(.{4})(.{4})(.{12})/)
    .slice(1)
    .join('-')
}

/**
 * Matches a path against an Express-style pattern
 * @param {string} pattern Pattern to match against
 * @param {string} path Path to test
 * @returns {boolean} Whether path matches pattern
 */
export function matchPath({ pattern, path }) {
  pattern = pattern.replace(/\*$/, '')
  pattern = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*$'

  try {
    const regex = new RegExp(pattern)
    return regex.test(path)
  } catch (err) {
    return false
  }
}

/**
 * Logs a request with structured output
 * @param {Object} params Log parameters
 * @param {string} [params.service='dev-mode-proxy'] Service name
 * @param {string[]} params.args Log arguments
 * @param {string} params.level Log level
 * @param {boolean} [params.skip=false] Whether to skip logging
 */
export function logRequest({
  service = 'serverless-dev-mode-proxy',
  args,
  level,
  skip = false,
}) {
  if (skip) {
    return
  }
  const logEntry = {
    service,
    args,
    level,
  }
  console.log(JSON.stringify(logEntry))
}
