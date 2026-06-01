/**
 * Path translation helpers for REST API routes.
 *
 * REST API URLs deployed to AWS carry a stage segment by default — a request
 * to `/users` defined in `serverless.yml` is served at
 * `https://<id>.execute-api.<region>.amazonaws.com/<stage>/users`.  Reproducing
 * that mounted path locally keeps client code (URLs hard-coded with the stage
 * in them) and route definitions working without modification.  Users running
 * the offline server behind a reverse proxy can layer on an extra `--prefix`
 * segment so the local URL mirrors the proxied production URL exactly.
 *
 * These helpers are pure so the REST route loader can call them without IO
 * and they can be exercised by unit tests without a Hapi server.
 */

/**
 * Translate an APIGW v1 path template to a Hapi path template.
 *
 * APIGW v1 supports two placeholder forms that differ from Hapi:
 *  - Greedy proxy `{proxy+}` matches one or more path segments — Hapi spells
 *    this as `{proxy*}`.
 *  - Bare `*` is the catch-all path shorthand — Hapi requires it to be a named
 *    multi-segment parameter rooted at `/`.
 *
 * Every other `{param}` placeholder is identical in both syntaxes.
 *
 * @param {string} apigwPath  The original APIGW path (e.g. `/api/{proxy+}`).
 * @returns {string}  The Hapi path (e.g. `/api/{proxy*}`).
 */
export function translateRestPath(apigwPath) {
  if (apigwPath === '*') return '/{any*}'
  // Use {proxy*} (Hapi accepts the name) so the matched value lands at request.params.proxy, matching the APIGW event.pathParameters.proxy contract.
  return apigwPath.replace(/\{proxy\+\}/g, '{proxy*}')
}

/**
 * Build the final mounted URL for a path by applying optional stage and
 * prefix segments.
 *
 * Combination rules:
 *  - `/<stage>/<path>` by default.
 *  - `/<stage>/<prefix>/<path>` when `prefix` is also set.
 *  - `/<prefix>/<path>` when `includeStage` is false and `prefix` is set.
 *  - The original path when `includeStage` is false and `prefix` is unset.
 *
 * The prefix is normalized — leading and trailing slashes are stripped so the
 * caller can pass `'api'`, `'/api'`, `'/api/'`, or `'api/'` interchangeably.
 *
 * @param {string} path  The path to mount.  Expected to begin with `/`.
 * @param {string} stage  The stage name (e.g. `'dev'`).
 * @param {object} [opts]
 * @param {boolean} [opts.includeStage=true]  Include the stage segment.
 * @param {string} [opts.prefix]              Extra segment to prepend.
 * @returns {string}
 */
export function buildMountedPath(path, stage, opts = {}) {
  const { includeStage = true, prefix } = opts

  // Callers may pass a path without a leading slash (`items`); AWS treats it the
  // same as `/items`, so normalize before joining segments.
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  // Trim surrounding slashes so `'api'`, `'/api'`, `'/api/'` all yield `'api'`.
  // An empty / slash-only prefix is treated as no prefix at all.
  const normalizedPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : ''
  const segments = []

  if (includeStage) segments.push(stage)
  if (normalizedPrefix) segments.push(normalizedPrefix)

  // No segments to prepend — leave the path untouched so callers don't have to
  // special-case the "no prefix configured" branch.
  if (segments.length === 0) return normalizedPath

  return `/${segments.join('/')}${normalizedPath}`
}
