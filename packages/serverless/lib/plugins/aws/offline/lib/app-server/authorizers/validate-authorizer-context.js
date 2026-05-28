/**
 * Validate + coerce an authorizer's returned `context`.
 *
 * AWS API Gateway requires every authorizer context value to be a string,
 * number, or boolean and stringifies them before exposing them to the
 * integration. A non-primitive value is a configuration error.
 *
 * @param {unknown} context
 * @returns {{ ok: true, context: Record<string, string> } | { ok: false }}
 *   `ok:true` with every value String()-coerced; `ok:false` when `context`
 *   is not a plain object or any value is not boolean/number/string. Nullish
 *   input is treated as an empty (valid) context.
 */
export function validateAuthorizerContext(context) {
  if (context === null || context === undefined) {
    return { ok: true, context: {} }
  }
  if (typeof context !== 'object' || Array.isArray(context)) {
    return { ok: false }
  }

  const out = {}
  for (const [key, value] of Object.entries(context)) {
    const t = typeof value
    if (t !== 'boolean' && t !== 'number' && t !== 'string') {
      return { ok: false }
    }
    out[key] = String(value)
  }
  return { ok: true, context: out }
}
