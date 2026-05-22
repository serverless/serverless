import { detectService } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/dispatcher.js'

/**
 * Build a minimal fake Hapi request with only the headers object populated.
 *
 * @param {Record<string, string>} headers
 * @returns {{ headers: Record<string, string> }}
 */
function makeRequest(headers = {}) {
  return { headers }
}

/**
 * Produce a syntactically-valid SigV4 Authorization header for the given
 * service name.  The AKID, date, region, and signature are placeholders —
 * the dispatcher only parses the service segment and does NOT verify the
 * signature.
 *
 * @param {string} service  e.g. 'sqs', 'sns', 's3'
 * @param {string} [region] defaults to 'us-east-1'
 * @returns {string}
 */
function sigV4Header(service, region = 'us-east-1') {
  return (
    `AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260522/${region}/${service}/aws4_request, ` +
    'SignedHeaders=content-type;host;x-amz-date, ' +
    'Signature=abc123def456'
  )
}

// ---------------------------------------------------------------------------
// 1–5. Recognised services
// ---------------------------------------------------------------------------

it('1. recognises sqs from Authorization header', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('sqs') })),
  ).toBe('sqs')
})

it('2. recognises sns from Authorization header', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('sns') })),
  ).toBe('sns')
})

it('3. recognises s3 from Authorization header', () => {
  expect(detectService(makeRequest({ authorization: sigV4Header('s3') }))).toBe(
    's3',
  )
})

it('4. recognises events from Authorization header', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('events') })),
  ).toBe('events')
})

it('5. recognises lambda from Authorization header', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('lambda') })),
  ).toBe('lambda')
})

// ---------------------------------------------------------------------------
// 6. Unrecognised service
// ---------------------------------------------------------------------------

it('6. returns null for an unrecognised service (iam)', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('iam') })),
  ).toBeNull()
})

// ---------------------------------------------------------------------------
// 7. Missing Authorization header
// ---------------------------------------------------------------------------

it('7. returns null when Authorization header is missing', () => {
  expect(detectService(makeRequest({}))).toBeNull()
})

// ---------------------------------------------------------------------------
// 8. Non-SigV4 Authorization header
// ---------------------------------------------------------------------------

it('8. returns null for a non-SigV4 Authorization header (Bearer token)', () => {
  expect(
    detectService(makeRequest({ authorization: 'Bearer sometoken123' })),
  ).toBeNull()
})

// ---------------------------------------------------------------------------
// 9. Malformed credential scope
// ---------------------------------------------------------------------------

it('9. returns null for a malformed credential scope with fewer than 5 segments', () => {
  // Only 3 segments — missing service and trailing aws4_request
  const header =
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260522/us-east-1, ' +
    'SignedHeaders=host, Signature=abc'
  expect(detectService(makeRequest({ authorization: header }))).toBeNull()
})

// ---------------------------------------------------------------------------
// 10. Case-insensitivity: Hapi normalises headers to lower-case but the
//     dispatcher should also handle upper-case key names gracefully.
// ---------------------------------------------------------------------------

it('10a. works when header key is lower-case authorization (Hapi default)', () => {
  expect(
    detectService(makeRequest({ authorization: sigV4Header('sqs') })),
  ).toBe('sqs')
})

it('10b. works when header key is upper-case Authorization', () => {
  // Some test harnesses / raw Node.js objects may keep the original casing.
  expect(
    detectService(makeRequest({ Authorization: sigV4Header('sqs') })),
  ).toBe('sqs')
})
