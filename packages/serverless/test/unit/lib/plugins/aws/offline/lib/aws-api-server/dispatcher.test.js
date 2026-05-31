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

// ---------------------------------------------------------------------------
// 11–15. Presigned-URL routing (no Authorization header).
//
// Presigned S3 URLs carry their signature in the query string, not the
// Authorization header, so the auth-header path never matches them. The
// dispatcher additionally routes a presigned request to 's3' when the
// X-Amz-Credential scope names the s3 service, or when the request is a
// presigned URL against a bucket-shaped path.
// ---------------------------------------------------------------------------

/**
 * Build a fake request with an explicit query and path (no auth header), as a
 * presigned URL arrives.
 *
 * @param {{ query?: object, path?: string, headers?: object }} input
 * @returns {{ headers: object, query: object, path: string }}
 */
function makePresignedRequest({ query = {}, path = '/', headers = {} } = {}) {
  return { headers, query, path }
}

/**
 * A SigV4 presigned query whose credential scope names the s3 service.
 *
 * @param {string} [service] - service segment of the credential scope.
 * @returns {Record<string, string>}
 */
function presignedQuery(service = 's3') {
  return {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `AKIAIOSFODNN7EXAMPLE/20260531/us-east-1/${service}/aws4_request`,
    'X-Amz-Date': '20260531T120000Z',
    'X-Amz-Expires': '900',
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Signature': 'abc123def456',
  }
}

it('11. routes a presigned S3 query (no auth header) to s3 via the credential scope', () => {
  expect(
    detectService(
      makePresignedRequest({
        query: presignedQuery('s3'),
        path: '/my-bucket/key.txt',
      }),
    ),
  ).toBe('s3')
})

it('12. routes a presigned URL against a bucket-shaped path to s3', () => {
  // A SigV2 presigned query carries no `/s3/` credential scope, so routing
  // falls back to the presigned-against-a-bucket-path signal.
  const query = {
    AWSAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    Signature: 'abc123def456',
    Expires: '1900000000',
  }
  expect(
    detectService(makePresignedRequest({ query, path: '/my-bucket/key.txt' })),
  ).toBe('s3')
})

it('13. returns null for a presigned request against the service root (no bucket)', () => {
  const query = {
    AWSAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    Signature: 'abc123def456',
    Expires: '1900000000',
  }
  expect(detectService(makePresignedRequest({ query, path: '/' }))).toBeNull()
})

it('14. returns null for a non-presigned, unknown request with no auth header', () => {
  expect(
    detectService(
      makePresignedRequest({
        query: { 'list-type': '2' },
        path: '/my-bucket',
      }),
    ),
  ).toBeNull()
})

it('15. an auth-header SigV4 request still routes by the header, ignoring the query', () => {
  // Even with an s3 credential scope in the query, a present auth header for a
  // different service wins — the additive presigned path only runs when the
  // header did not already resolve a service.
  expect(
    detectService({
      headers: { authorization: sigV4Header('sqs') },
      query: presignedQuery('s3'),
      path: '/my-bucket/key.txt',
    }),
  ).toBe('sqs')
})

it('16. tolerates a request with no query field at all', () => {
  // The original auth-header-only callers pass `{ headers }` with no `query`.
  expect(detectService({ headers: {} })).toBeNull()
})

it('17. does NOT route a SigV4 presign scoped to sqs to s3, even on a bucket-shaped path', () => {
  // The credential scope names sqs, so the s3 handler must not claim it; the
  // bucket-shaped fallback only applies to scopeless v2 presigns.
  expect(
    detectService(
      makePresignedRequest({
        query: presignedQuery('sqs'),
        path: '/my-bucket/key.txt',
      }),
    ),
  ).toBeNull()
})

it('18. does NOT route a SigV4 presign scoped to sns/lambda/events to s3', () => {
  for (const service of ['sns', 'lambda', 'events']) {
    expect(
      detectService(
        makePresignedRequest({
          query: presignedQuery(service),
          path: '/my-bucket/key.txt',
        }),
      ),
    ).toBeNull()
  }
})

it('19. routes a SigV4 presign scoped to s3 to s3 even when the credential is the only signal', () => {
  // No bucket-shaped reliance: the `/s3/` scope alone is authoritative.
  expect(
    detectService(
      makePresignedRequest({ query: presignedQuery('s3'), path: '/' }),
    ),
  ).toBe('s3')
})

it('20. does NOT route a SigV4 presign scoped to an unrecognised service to s3', () => {
  // An iam-scoped presign is neither s3 nor a recognised non-s3 service that
  // the auth-header path would handle; it must not be claimed for s3.
  expect(
    detectService(
      makePresignedRequest({
        query: presignedQuery('iam'),
        path: '/my-bucket/key.txt',
      }),
    ),
  ).toBeNull()
})
