/**
 * Parse a string as JSON, returning the parsed value on success or `null`
 * on any failure shape. Callers treat null as "no value; fall through to
 * the next priority".
 *
 * Rejects (returns null) for:
 *  - Non-string input
 *  - Empty string
 *  - JSON parse error
 *  - Parsed result is not an object (i.e. number / string literal / null)
 *
 * Arrays ARE accepted because `typeof [] === 'object'`. Callers that need
 * a strict plain-object check should narrow further at the call site.
 *
 * @param {unknown} value
 * @returns {object | null}
 */
export function parseJsonSafe(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
