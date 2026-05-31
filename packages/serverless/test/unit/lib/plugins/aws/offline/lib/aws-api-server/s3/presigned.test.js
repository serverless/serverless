import {
  isPresigned,
  checkPresignedExpiry,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/presigned.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A fixed reference instant: 2026-05-31T12:00:00Z. */
const NOW = Date.parse('2026-05-31T12:00:00Z')

/**
 * Build a SigV4 presigned query (`X-Amz-*` params). `date` defaults to the
 * reference instant rendered in S3's basic ISO8601 (`YYYYMMDDTHHMMSSZ`).
 *
 * @param {{ date?: string, expires?: string }} [overrides]
 * @returns {Record<string, string>}
 */
function sigV4Query({ date = '20260531T120000Z', expires = '900' } = {}) {
  return {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential':
      'AKIAIOSFODNN7EXAMPLE/20260531/us-east-1/s3/aws4_request',
    'X-Amz-Date': date,
    'X-Amz-Expires': expires,
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Signature': 'abc123def456',
  }
}

/**
 * Build a SigV2 presigned query (`AWSAccessKeyId`/`Signature`/`Expires`).
 *
 * @param {{ expires?: string }} [overrides]
 * @returns {Record<string, string>}
 */
function sigV2Query({ expires = String(Math.floor(NOW / 1000) + 900) } = {}) {
  return {
    AWSAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    Signature: 'abc123def456',
    Expires: expires,
  }
}

// ---------------------------------------------------------------------------
// isPresigned
// ---------------------------------------------------------------------------

it('1. detects a SigV4 presigned query', () => {
  expect(isPresigned(sigV4Query())).toBe(true)
})

it('2. detects a SigV2 presigned query', () => {
  expect(isPresigned(sigV2Query())).toBe(true)
})

it('3. is false for a plain query with no presign params', () => {
  expect(isPresigned({ 'list-type': '2', prefix: 'a/' })).toBe(false)
})

it('4. is false for an empty / missing query', () => {
  expect(isPresigned({})).toBe(false)
  expect(isPresigned(undefined)).toBe(false)
})

it('5. is false for a partial SigV4 query (missing Signature)', () => {
  const query = sigV4Query()
  delete query['X-Amz-Signature']
  expect(isPresigned(query)).toBe(false)
})

it('6. is false for a partial SigV2 query (missing Expires)', () => {
  const query = sigV2Query()
  delete query.Expires
  expect(isPresigned(query)).toBe(false)
})

// ---------------------------------------------------------------------------
// checkPresignedExpiry — SigV4
// ---------------------------------------------------------------------------

it('7. SigV4: within the window is not expired', () => {
  // signed at 12:00:00Z, 900s window → valid until 12:15:00Z; check at 12:10.
  const now = Date.parse('2026-05-31T12:10:00Z')
  expect(checkPresignedExpiry(sigV4Query(), now)).toEqual({ expired: false })
})

it('8. SigV4: after the window is expired', () => {
  // 900s window from 12:00:00Z → expires 12:15:00Z; check at 12:20.
  const now = Date.parse('2026-05-31T12:20:00Z')
  expect(checkPresignedExpiry(sigV4Query(), now)).toEqual({ expired: true })
})

it('9. SigV4: exactly at the boundary is not expired', () => {
  // expires at 12:15:00Z exactly; now === boundary is still valid (now > end).
  const now = Date.parse('2026-05-31T12:15:00Z')
  expect(checkPresignedExpiry(sigV4Query(), now)).toEqual({ expired: false })
})

it('10. SigV4: unparseable X-Amz-Date is treated as not expired (lenient)', () => {
  const query = sigV4Query({ date: 'not-a-date' })
  expect(checkPresignedExpiry(query, NOW)).toEqual({ expired: false })
})

it('11. SigV4: missing X-Amz-Expires is treated as not expired (lenient)', () => {
  const query = sigV4Query()
  delete query['X-Amz-Expires']
  expect(checkPresignedExpiry(query, NOW)).toEqual({ expired: false })
})

// ---------------------------------------------------------------------------
// checkPresignedExpiry — SigV2
// ---------------------------------------------------------------------------

it('12. SigV2: an Expires in the future is not expired', () => {
  const expires = String(Math.floor(NOW / 1000) + 900)
  expect(checkPresignedExpiry(sigV2Query({ expires }), NOW)).toEqual({
    expired: false,
  })
})

it('13. SigV2: an Expires in the past is expired', () => {
  const expires = String(Math.floor(NOW / 1000) - 1)
  expect(checkPresignedExpiry(sigV2Query({ expires }), NOW)).toEqual({
    expired: true,
  })
})

it('14. SigV2: an unparseable Expires is treated as not expired (lenient)', () => {
  expect(checkPresignedExpiry(sigV2Query({ expires: 'soon' }), NOW)).toEqual({
    expired: false,
  })
})

// ---------------------------------------------------------------------------
// checkPresignedExpiry — non-presigned / defaulting
// ---------------------------------------------------------------------------

it('15. a non-presigned query is treated as not expired', () => {
  expect(checkPresignedExpiry({}, NOW)).toEqual({ expired: false })
})

it('16. defaults now to the current time when omitted', () => {
  // A far-future SigV2 expiry must never be expired against the real clock.
  const expires = String(Math.floor(Date.now() / 1000) + 3600)
  expect(checkPresignedExpiry(sigV2Query({ expires }))).toEqual({
    expired: false,
  })
})
