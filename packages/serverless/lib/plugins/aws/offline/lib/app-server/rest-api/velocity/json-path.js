import { JSONPath } from 'jsonpath-plus'

/**
 * Full JSONPath evaluation used by `$input.json($.x.y)` and `$input.path($.x)`
 * in REST API velocity templates.
 *
 * Supports the complete JSONPath grammar, including dot-notation keys
 * (`$.a.b`), array indexing (`$.list[0]`), wildcards (`$.list[*].a`),
 * recursive descent (`$..x`), bracket-quoted keys (`$['a-b']`), and array
 * slices (`$.list[1:3]`).
 *
 * Single-value contract: a deterministic path that resolves to one node
 * returns that node's value unwrapped (not an array). A wildcard, recursive,
 * or slice expression that matches multiple nodes returns an array of the
 * matched values. A path that matches nothing returns `undefined`. An empty,
 * `undefined`, or `null` path returns the input value unchanged. Leading `$`
 * is optional and a leading `.` is tolerated.
 *
 * @param {unknown} value - The value to evaluate against.
 * @param {string} path   - JSONPath expression.
 * @returns {unknown} The resolved value(s), or undefined if nothing matches.
 */
export function jsonPath(value, path) {
  if (path === undefined || path === null || path === '') return value
  const expr = path.startsWith('$')
    ? path
    : `$${path.startsWith('.') ? '' : '.'}${path}`
  try {
    return JSONPath({ path: expr, json: value, wrap: false })
  } catch {
    return undefined
  }
}
