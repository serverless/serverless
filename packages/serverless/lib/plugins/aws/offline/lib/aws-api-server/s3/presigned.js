/**
 * Presigned-URL detection + loose expiry check for the offline S3 emulator.
 *
 * S3 presigned URLs carry the signature and its scope in the query string
 * rather than the Authorization header, in one of two flavours:
 *   - SigV4: `X-Amz-Algorithm` + `X-Amz-Credential` + `X-Amz-Date` +
 *     `X-Amz-Expires` + `X-Amz-Signature` (relative window: `X-Amz-Date` plus
 *     `X-Amz-Expires` seconds).
 *   - SigV2 (legacy): `AWSAccessKeyId` + `Signature` + `Expires` (an absolute
 *     epoch-seconds deadline).
 *
 * The parameter names and the two-flavour expiry handling follow the patterns
 * in `localstack-core/localstack/services/s3/presigned_url.py` from the
 * LocalStack project (Apache-2.0). We intentionally do NOT verify the
 * cryptographic signature: offline credentials are placeholders, so a valid
 * signature cannot be produced or checked. Detection is structural (the
 * presence of the signing params) and the expiry check is best-effort —
 * anything missing or unparseable is treated as NOT expired so a malformed but
 * well-intentioned request still reaches the data plane.
 */

/** SigV4 presign query params that, together, mark a request as presigned. */
const SIGV4_PARAMS = ['X-Amz-Algorithm', 'X-Amz-Signature', 'X-Amz-Credential']

/** SigV2 presign query params that, together, mark a request as presigned. */
const SIGV2_PARAMS = ['AWSAccessKeyId', 'Signature', 'Expires']

/**
 * Whether every named param is present (and non-empty) in the query.
 *
 * @param {Record<string, string>} query
 * @param {string[]} names
 * @returns {boolean}
 */
function hasAll(query, names) {
  return names.every((name) => query[name] !== undefined && query[name] !== '')
}

/**
 * Whether the query carries SigV4 presign params.
 *
 * @param {Record<string, string>} query
 * @returns {boolean}
 */
function isSigV4(query) {
  return hasAll(query, SIGV4_PARAMS)
}

/**
 * Whether the query carries SigV2 presign params.
 *
 * @param {Record<string, string>} query
 * @returns {boolean}
 */
function isSigV2(query) {
  return hasAll(query, SIGV2_PARAMS)
}

/**
 * Whether a query string identifies a presigned request (SigV4 or legacy
 * SigV2). Structural only — no signature verification (see module note).
 *
 * @param {Record<string, string> | undefined} query
 * @returns {boolean}
 */
export function isPresigned(query) {
  if (!query) return false
  return isSigV4(query) || isSigV2(query)
}

/**
 * Parse S3's basic ISO8601 `X-Amz-Date` (`YYYYMMDDTHHMMSSZ`) into epoch ms.
 *
 * @param {string | undefined} value
 * @returns {number | undefined} epoch milliseconds, or undefined when absent /
 *   not in the expected basic-ISO8601 shape.
 */
function parseAmzDate(value) {
  if (!value) return undefined
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    String(value),
  )
  if (!match) return undefined
  const [, year, month, day, hour, minute, second] = match
  const ms = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * Coerce a query value to a finite number, or undefined when absent / not
 * numeric.
 *
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
function toNumber(value) {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Check whether a presigned URL has expired.
 *
 * SigV4: the URL is valid for `X-Amz-Expires` seconds starting at `X-Amz-Date`,
 * so it is expired when `now > date + expires * 1000`. SigV2: `Expires` is an
 * absolute epoch-seconds deadline, so it is expired when `now / 1000 > Expires`.
 *
 * The check is lenient: a missing or unparseable date/expiry (or a
 * non-presigned query) yields `{ expired: false }` — the signature is never
 * verified, so a best-effort window is all that is meaningful offline.
 *
 * @param {Record<string, string> | undefined} query
 * @param {number} [now=Date.now()] - reference instant in epoch milliseconds.
 * @returns {{ expired: boolean }}
 */
export function checkPresignedExpiry(query, now = Date.now()) {
  if (!query) return { expired: false }

  if (isSigV4(query)) {
    const date = parseAmzDate(query['X-Amz-Date'])
    const expires = toNumber(query['X-Amz-Expires'])
    if (date === undefined || expires === undefined) return { expired: false }
    return { expired: now > date + expires * 1000 }
  }

  if (isSigV2(query)) {
    const expires = toNumber(query.Expires)
    if (expires === undefined) return { expired: false }
    return { expired: now / 1000 > expires }
  }

  return { expired: false }
}
