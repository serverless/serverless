/**
 * Path translation helpers for REST API routes.
 *
 * REST API URLs deployed to AWS carry a stage segment by default — a request
 * to `/users` defined in `serverless.yml` is served at
 * `https://<id>.execute-api.<region>.amazonaws.com/<stage>/users`.  Reproducing
 * that locally keeps client code (URLs hard-coded with the stage in them) and
 * route definitions working without modification.  Users running the offline
 * server behind a reverse proxy can layer on an extra `--prefix` segment so
 * the local URL mirrors the proxied production URL exactly.
 *
 * These helpers are pure so the REST route loader can call them without IO
 * and they can be exercised by unit tests without a Hapi server.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate an APIGW v1 path template to a Hapi path template.
 *
 * APIGW v1 supports two placeholder forms that differ from Hapi:
 *  - Greedy proxy `{proxy+}` matches one or more path segments — Hapi spells
 *    this as `{any*}`.
 *  - Bare `*` is the catch-all path shorthand — Hapi requires it to be a named
 *    multi-segment parameter rooted at `/`.
 *
 * Every other `{param}` placeholder is identical in both syntaxes.
 *
 * @param {string} apigwPath  The original APIGW path (e.g. `/api/{proxy+}`).
 * @returns {string}  The Hapi path (e.g. `/api/{any*}`).
 */
export function translateRestPath(apigwPath) {
  if (apigwPath === '*') return '/{any*}'
  return apigwPath.replace(/\{proxy\+\}/g, '{any*}')
}

/**
 * Prepend the stage and/or a user-supplied prefix segment to a path.
 *
 * Combination rules:
 *  - `/<stage>/<path>` by default.
 *  - `/<stage>/<prefix>/<path>` when `prefix` is also set.
 *  - `/<prefix>/<path>` when `noPrependStage` is true and `prefix` is set.
 *  - The original path when `noPrependStage` is true and `prefix` is unset.
 *
 * The prefix is normalized — leading and trailing slashes are stripped so the
 * caller can pass `'api'`, `'/api'`, `'/api/'`, or `'api/'` interchangeably.
 *
 * @param {string} path  The path to prefix.  Expected to begin with `/`.
 * @param {string} stage  The stage name (e.g. `'dev'`).
 * @param {object} [opts]
 * @param {boolean} [opts.noPrependStage=false]  Skip the stage segment.
 * @param {string} [opts.prefix]                 Extra segment to prepend.
 * @returns {string}
 */
export function prependStage(path, stage, opts = {}) {
  const { noPrependStage = false, prefix } = opts

  // Trim surrounding slashes so `'api'`, `'/api'`, `'/api/'` all yield `'api'`.
  // An empty / slash-only prefix is treated as no prefix at all.
  const normalizedPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : ''
  const segments = []

  if (!noPrependStage) segments.push(stage)
  if (normalizedPrefix) segments.push(normalizedPrefix)

  // No segments to prepend — leave the path untouched so callers don't have to
  // special-case the "no prefix configured" branch.
  if (segments.length === 0) return path

  return `/${segments.join('/')}${path}`
}
