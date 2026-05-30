/**
 * Shared MD5 helpers for the local SQS emulator.
 *
 * These implement the exact digest algorithm AWS uses for `MD5OfMessageBody`
 * (`MD5OfBody`) and `MD5OfMessageAttributes`. The AWS SDKs verify both values
 * on the SendMessage / ReceiveMessage response, so the byte layout must match
 * AWS precisely.
 */

import { createHash } from 'node:crypto'

/**
 * Compute the MD5 hex digest of a UTF-8 string — matches the value AWS
 * returns in `MD5OfMessageBody` / `MD5OfBody`.
 *
 * @param {string} str
 * @returns {string} Lower-case hex MD5.
 */
export function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex')
}

/** Transport-type byte AWS prepends to a String attribute value. */
const STRING_TYPE_FIELD_INDEX = 1
/** Transport-type byte AWS prepends to a Binary attribute value. */
const BINARY_TYPE_FIELD_INDEX = 2

/**
 * Push a 4-byte big-endian length prefix followed by the bytes themselves
 * into the running hash. AWS prefixes every variable-length segment of the
 * attribute serialization this way.
 *
 * @param {import('node:crypto').Hash} hash
 * @param {Buffer} buf
 */
function updateLengthAndValue(hash, buf) {
  const lengthPrefix = Buffer.alloc(4)
  lengthPrefix.writeUInt32BE(buf.length, 0)
  hash.update(lengthPrefix)
  hash.update(buf)
}

/**
 * Compute `MD5OfMessageAttributes` for a SendMessage call's attribute map.
 *
 * AWS specifies the algorithm precisely (the SDKs verify it):
 *   for each attribute, sorted alphabetically by Name:
 *     encode Name             (length-prefixed UTF-8)
 *     encode DataType         (length-prefixed UTF-8)
 *     write transport-type byte (1 for String, 2 for Binary)
 *     encode value            (length-prefixed UTF-8 / raw bytes)
 *   MD5 the resulting buffer.
 *
 * Returns `undefined` when there are no attributes — the caller omits the
 * field from the response (matching AWS).
 *
 * @param {Record<string, { DataType: string, StringValue?: string, BinaryValue?: string | Buffer }>} attributes
 * @returns {string | undefined} Lower-case hex MD5, or undefined when empty.
 */
export function md5OfMessageAttributes(attributes) {
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Object.keys(attributes).length === 0
  ) {
    return undefined
  }

  const hash = createHash('md5')
  const sortedNames = Object.keys(attributes).sort()

  for (const name of sortedNames) {
    const attr = attributes[name]
    if (!attr || typeof attr !== 'object') continue

    updateLengthAndValue(hash, Buffer.from(name, 'utf8'))
    updateLengthAndValue(hash, Buffer.from(attr.DataType ?? '', 'utf8'))

    if (attr.StringValue !== undefined && attr.StringValue !== null) {
      hash.update(Buffer.from([STRING_TYPE_FIELD_INDEX]))
      updateLengthAndValue(hash, Buffer.from(String(attr.StringValue), 'utf8'))
    } else if (attr.BinaryValue !== undefined && attr.BinaryValue !== null) {
      hash.update(Buffer.from([BINARY_TYPE_FIELD_INDEX]))
      const binary = Buffer.isBuffer(attr.BinaryValue)
        ? attr.BinaryValue
        : Buffer.from(String(attr.BinaryValue), 'base64')
      updateLengthAndValue(hash, binary)
    }
  }

  return hash.digest('hex')
}
