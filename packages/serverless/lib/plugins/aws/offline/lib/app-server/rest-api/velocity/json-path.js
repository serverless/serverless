/**
 * Minimal JSONPath subset used by `$input.json($.x.y)` and `$input.path($.x)`
 * in REST API velocity templates.
 *
 * Supports: root (`$`), dot-notation keys (`$.a`, `$.a.b`), and bracket
 * array indexing (`$.list[0]`, `$.a.b[1].c`). Bracket-notation strings,
 * predicate filters, and recursive descent are NOT supported — the AWS
 * mapping-template surface in practice uses only this subset.
 *
 * @param {unknown} value - The value to walk.
 * @param {string} path   - JSONPath expression.
 * @returns {unknown} The resolved value, or undefined if the chain breaks.
 */
export function jsonPath(value, path) {
  if (path === undefined || path === null || path === '') return value
  // Strip optional leading "$" or "$." — both are accepted.
  let expr = path
  if (expr.startsWith('$')) expr = expr.slice(1)
  if (expr.startsWith('.')) expr = expr.slice(1)
  if (expr === '') return value

  // Split on dots, then split each segment on `[N]` array indexing.
  // e.g. "a.b[1].c" → ["a", "b", 1, "c"]
  const tokens = []
  for (const seg of expr.split('.')) {
    if (seg === '') continue
    const bracketMatch = seg.match(/^([^[]+)((?:\[\d+\])*)$/)
    if (bracketMatch) {
      tokens.push(bracketMatch[1])
      const brackets = bracketMatch[2].matchAll(/\[(\d+)\]/g)
      for (const m of brackets) tokens.push(Number.parseInt(m[1], 10))
    } else {
      tokens.push(seg)
    }
  }

  let current = value
  for (const tok of tokens) {
    if (current === undefined || current === null) return undefined
    current = current[tok]
  }
  return current
}
