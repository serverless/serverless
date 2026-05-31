import { parseS3Request } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/request-parser.js'

/**
 * Convenience wrapper: build a request descriptor with sensible defaults so
 * each test only states the bits it cares about.
 */
function req({ method = 'GET', path = '/', query = {}, headers = {} } = {}) {
  return parseS3Request({ method, path, query, headers })
}

// ===========================================================================
// Path-style addressing
// ===========================================================================

it('1. root path with no bucket and GET → ListBuckets', () => {
  expect(req({ method: 'GET', path: '/' }).operation).toBe('ListBuckets')
})

it('2. splits the first path segment as bucket and the rest as key', () => {
  const parsed = req({ method: 'GET', path: '/my-bucket/a/b/c.txt' })
  expect(parsed.bucket).toBe('my-bucket')
  expect(parsed.key).toBe('a/b/c.txt')
})

it('3. bucket-only path has an empty key', () => {
  const parsed = req({ method: 'GET', path: '/my-bucket' })
  expect(parsed.bucket).toBe('my-bucket')
  expect(parsed.key).toBe('')
})

it('4. URL-decodes the key', () => {
  const parsed = req({ method: 'GET', path: '/my-bucket/a%20b%2Fc.txt' })
  expect(parsed.key).toBe('a b/c.txt')
})

// ===========================================================================
// Bucket-level operations
// ===========================================================================

it('5. PUT /<bucket> (no key) → CreateBucket', () => {
  const parsed = req({ method: 'PUT', path: '/my-bucket' })
  expect(parsed.operation).toBe('CreateBucket')
  expect(parsed.bucket).toBe('my-bucket')
})

it('6. DELETE /<bucket> (no key) → DeleteBucket', () => {
  expect(req({ method: 'DELETE', path: '/my-bucket' }).operation).toBe(
    'DeleteBucket',
  )
})

it('7. GET /<bucket> → ListObjects (v1)', () => {
  const parsed = req({
    method: 'GET',
    path: '/my-bucket',
    query: { prefix: 'logs/', delimiter: '/', marker: 'm', 'max-keys': '10' },
  })
  expect(parsed.operation).toBe('ListObjects')
  expect(parsed.params).toMatchObject({
    prefix: 'logs/',
    delimiter: '/',
    marker: 'm',
    maxKeys: 10,
  })
})

it('8. GET /<bucket>?list-type=2 → ListObjectsV2', () => {
  const parsed = req({
    method: 'GET',
    path: '/my-bucket',
    query: {
      'list-type': '2',
      prefix: 'p',
      delimiter: '/',
      'max-keys': '5',
      'continuation-token': 'ct',
      'start-after': 'sa',
    },
  })
  expect(parsed.operation).toBe('ListObjectsV2')
  expect(parsed.params).toMatchObject({
    prefix: 'p',
    delimiter: '/',
    maxKeys: 5,
    continuationToken: 'ct',
    startAfter: 'sa',
  })
})

it('9. GET /<bucket>?location → GetBucketLocation', () => {
  expect(
    req({ method: 'GET', path: '/my-bucket', query: { location: '' } })
      .operation,
  ).toBe('GetBucketLocation')
})

it('10. GET /<bucket>?uploads → ListMultipartUploads', () => {
  expect(
    req({ method: 'GET', path: '/my-bucket', query: { uploads: '' } })
      .operation,
  ).toBe('ListMultipartUploads')
})

it('11. POST /<bucket>?delete → DeleteObjects', () => {
  const parsed = req({
    method: 'POST',
    path: '/my-bucket',
    query: { delete: '' },
  })
  expect(parsed.operation).toBe('DeleteObjects')
  expect(parsed.bucket).toBe('my-bucket')
})

// ===========================================================================
// Object PUT disambiguation: PutObject vs UploadPart vs CopyObject
// ===========================================================================

it('12. PUT /<bucket>/<key> → PutObject with content-type + meta headers', () => {
  const parsed = req({
    method: 'PUT',
    path: '/my-bucket/k.txt',
    headers: {
      'content-type': 'text/plain',
      'x-amz-meta-author': 'tom',
      'x-amz-meta-Tag': 'v',
    },
  })
  expect(parsed.operation).toBe('PutObject')
  expect(parsed.params.contentType).toBe('text/plain')
  expect(parsed.params.metadata).toEqual({
    'x-amz-meta-author': 'tom',
    'x-amz-meta-tag': 'v',
  })
})

it('13. PUT /<bucket>/<key>?partNumber&uploadId → UploadPart', () => {
  const parsed = req({
    method: 'PUT',
    path: '/my-bucket/k',
    query: { partNumber: '2', uploadId: 'u-1' },
  })
  expect(parsed.operation).toBe('UploadPart')
  expect(parsed.params.partNumber).toBe(2)
  expect(parsed.params.uploadId).toBe('u-1')
})

it('14. PUT /<bucket>/<key> with x-amz-copy-source → CopyObject', () => {
  const parsed = req({
    method: 'PUT',
    path: '/dst-bucket/dst-key',
    headers: { 'x-amz-copy-source': '/src-bucket/src-key' },
  })
  expect(parsed.operation).toBe('CopyObject')
  expect(parsed.params.copySource).toEqual({
    bucket: 'src-bucket',
    key: 'src-key',
  })
})

it('15. PUT copy-source + partNumber&uploadId → UploadPartCopy', () => {
  const parsed = req({
    method: 'PUT',
    path: '/dst-bucket/dst-key',
    query: { partNumber: '3', uploadId: 'u-9' },
    headers: {
      'x-amz-copy-source': '/src-bucket/src-key',
      'x-amz-copy-source-range': 'bytes=0-9',
    },
  })
  expect(parsed.operation).toBe('UploadPartCopy')
  expect(parsed.params.partNumber).toBe(3)
  expect(parsed.params.uploadId).toBe('u-9')
  expect(parsed.params.copySource).toEqual({
    bucket: 'src-bucket',
    key: 'src-key',
  })
  expect(parsed.params.copySourceRange).toBe('bytes=0-9')
})

it('16. x-amz-copy-source URL-decodes and tolerates a leading slash being absent', () => {
  const parsed = req({
    method: 'PUT',
    path: '/dst/key',
    headers: { 'x-amz-copy-source': 'src-bucket/a%20b/c.txt' },
  })
  expect(parsed.params.copySource).toEqual({
    bucket: 'src-bucket',
    key: 'a b/c.txt',
  })
})

// ===========================================================================
// Object GET / HEAD / DELETE
// ===========================================================================

it('17. GET /<bucket>/<key> → GetObject (no range)', () => {
  const parsed = req({ method: 'GET', path: '/my-bucket/k' })
  expect(parsed.operation).toBe('GetObject')
  expect(parsed.params.range).toBeUndefined()
})

it('18. GET /<bucket>/<key> with Range header → GetObject carrying the range', () => {
  const parsed = req({
    method: 'GET',
    path: '/my-bucket/k',
    headers: { range: 'bytes=0-9' },
  })
  expect(parsed.operation).toBe('GetObject')
  expect(parsed.params.range).toBe('bytes=0-9')
})

it('19. HEAD /<bucket>/<key> → HeadObject', () => {
  expect(req({ method: 'HEAD', path: '/my-bucket/k' }).operation).toBe(
    'HeadObject',
  )
})

it('20. DELETE /<bucket>/<key> → DeleteObject', () => {
  expect(req({ method: 'DELETE', path: '/my-bucket/k' }).operation).toBe(
    'DeleteObject',
  )
})

it('21. DELETE /<bucket>/<key>?uploadId → AbortMultipartUpload', () => {
  const parsed = req({
    method: 'DELETE',
    path: '/my-bucket/k',
    query: { uploadId: 'u-7' },
  })
  expect(parsed.operation).toBe('AbortMultipartUpload')
  expect(parsed.params.uploadId).toBe('u-7')
})

// ===========================================================================
// Multipart create / complete / list parts
// ===========================================================================

it('22. POST /<bucket>/<key>?uploads → CreateMultipartUpload with meta', () => {
  const parsed = req({
    method: 'POST',
    path: '/my-bucket/k',
    query: { uploads: '' },
    headers: { 'content-type': 'application/json', 'x-amz-meta-a': '1' },
  })
  expect(parsed.operation).toBe('CreateMultipartUpload')
  expect(parsed.params.contentType).toBe('application/json')
  expect(parsed.params.metadata).toEqual({ 'x-amz-meta-a': '1' })
})

it('23. POST /<bucket>/<key>?uploadId → CompleteMultipartUpload', () => {
  const parsed = req({
    method: 'POST',
    path: '/my-bucket/k',
    query: { uploadId: 'u-2' },
  })
  expect(parsed.operation).toBe('CompleteMultipartUpload')
  expect(parsed.params.uploadId).toBe('u-2')
})

it('24. GET /<bucket>/<key>?uploadId → ListParts', () => {
  const parsed = req({
    method: 'GET',
    path: '/my-bucket/k',
    query: { uploadId: 'u-3' },
  })
  expect(parsed.operation).toBe('ListParts')
  expect(parsed.params.uploadId).toBe('u-3')
})

// ===========================================================================
// Defaults / edge cases
// ===========================================================================

it('25. list maxKeys defaults to undefined when absent (ops applies the cap)', () => {
  const parsed = req({ method: 'GET', path: '/my-bucket' })
  expect(parsed.params.maxKeys).toBeUndefined()
})
