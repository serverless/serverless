'use strict'

import ServerlessError from '../../../serverless-error.js'

/** `serverless invoke` options only a Lambda function invoke reads. */
const FUNCTION_ONLY_OPTIONS = [
  'qualifier',
  'type',
  'raw',
  'context',
  'contextPath',
  'tenant-id',
  'durable-execution-name',
]

/**
 * Per invoke target, the options its request does not read: passing one stops the command rather
 * than being ignored.
 */
const OPTIONS_NOT_AVAILABLE = {
  function: ['header'],
  agent: ['header'],
  'web-app': [...FUNCTION_ONLY_OPTIONS, 'session-id', 'port'],
  sandbox: [...FUNCTION_ONLY_OPTIONS, 'session-id', 'log'],
}

const TARGETS = ['function', 'agent', 'sandbox', 'web-app']

const listFlags = (flags) =>
  flags.length === 1
    ? flags[0]
    : `${flags.slice(0, -1).join(', ')} and ${flags[flags.length - 1]}`

/**
 * Throws when `serverless invoke` names one target and an option that target does not read, such
 * as `--qualifier` with `--web-app`. With more than one target the combination error of the
 * target's own plugin applies instead.
 *
 * @param {object} options - the command's options, by full name
 */
export function assertInvokeOptionsAvailable(options) {
  const targets = TARGETS.filter((target) => options[target] !== undefined)
  if (targets.length !== 1) return
  const [target] = targets
  const given = (OPTIONS_NOT_AVAILABLE[target] || []).filter(
    (option) => options[option] !== undefined,
  )
  if (given.length === 0) return
  const flags = given.map((option) => `--${option}`)
  throw new ServerlessError(
    `${listFlags(flags)} ${flags.length === 1 ? 'is' : 'are'} not available with --${target}.`,
    'INVOKE_OPTION_NOT_AVAILABLE',
    { stack: false },
  )
}

/** A header name: an HTTP token (RFC 9110). */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/**
 * The `--header 'Name: value'` options of an HTTP invoke (`--web-app`, `--sandbox`), as request
 * headers keyed by lower-case name. Surrounding whitespace is trimmed, an empty value is kept, and
 * a name given more than once gets its values joined with `, `. A value that is not one
 * `Name: value` line stops the command; the message does not repeat it, as it may hold a
 * credential. So does a header the Framework sets for the request (`reserved`: lower-case name to
 * the reason, worded to follow "the Framework sets it").
 *
 * @param {string|string[]|undefined} values - `options.header`
 * @param {Record<string, string>} reserved
 * @returns {Record<string, string>}
 */
export function parseHeaderOptions(values, reserved) {
  const headers = Object.create(null)
  for (const value of [].concat(values ?? [])) {
    const text = String(value)
    const colon = text.indexOf(':')
    const name = text.slice(0, colon).trim()
    const headerValue = text.slice(colon + 1).trim()
    if (
      colon === -1 ||
      !HEADER_NAME.test(name) ||
      /[\r\n\0]/.test(headerValue)
    ) {
      throw new ServerlessError(
        "Each --header must be one line in the form 'Name: value', for example --header 'Content-Type: application/json'.",
        'INVOKE_INVALID_HEADER',
        { stack: false },
      )
    }
    // fetch rejects characters above U+00FF, and SigV4 signs the value as UTF-8 while Latin-1
    // goes out as one byte, so only printable ASCII and tab reach the request as written.
    if (!/^[\t\x20-\x7E]*$/.test(headerValue)) {
      throw new ServerlessError(
        `The --header ${name} value must be printable ASCII text. Encode other characters first, for example with encodeURIComponent.`,
        'INVOKE_INVALID_HEADER',
        { stack: false },
      )
    }
    const key = name.toLowerCase()
    if (Object.hasOwn(reserved, key)) {
      throw new ServerlessError(
        `--header cannot set ${name}: the Framework sets it ${reserved[key]}.`,
        'INVOKE_RESERVED_HEADER',
        { stack: false },
      )
    }
    headers[key] =
      key in headers ? `${headers[key]}, ${headerValue}` : headerValue
  }
  return headers
}
