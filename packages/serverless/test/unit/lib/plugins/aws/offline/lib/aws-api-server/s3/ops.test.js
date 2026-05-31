import { createHash } from 'node:crypto'
import {
  runOp,
  S3OpError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/ops.js'
import { createBucketStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/bucket-store.js'

const BUCKET = 'my-bucket'
const FIXED_NOW = Date.parse('2023-11-14T22:13:20.000Z')

/** A store with a pinned clock so Last-Modified assertions are deterministic. */
function makeStore() {
  return createBucketStore({ now: () => FIXED_NOW })
}

/** Quoted hex md5 ETag, matching the store's format. */
function quotedMd5(buffer) {
  return '"' + createHash('md5').update(buffer).digest('hex') + '"'
}

/** Run an op against a fresh store-backed context. */
function run(store, operation, params) {
  return runOp(operation, params, { store, now: () => FIXED_NOW })
}

// ===========================================================================
// Buckets
// ===========================================================================

it('1. CreateBucket → 200 and the bucket exists', () => {
  const store = makeStore()
  const res = run(store, 'CreateBucket', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(200)
  expect(store.hasBucket(BUCKET)).toBe(true)
})

it('2. DeleteBucket → 204 for an empty bucket', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const res = run(store, 'DeleteBucket', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(204)
  expect(store.hasBucket(BUCKET)).toBe(false)
})

it('3. DeleteBucket on a non-empty bucket → BucketNotEmpty (409)', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  expect(() => run(store, 'DeleteBucket', { bucket: BUCKET, key: '' })).toThrow(
    expect.objectContaining({ awsCode: 'BucketNotEmpty', httpStatus: 409 }),
  )
})

it('4. ListBuckets → 200 XML listing each bucket', () => {
  const store = makeStore()
  store.createBucket('a')
  store.createBucket('b')
  const res = run(store, 'ListBuckets', {})
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<ListAllMyBucketsResult')
  expect(res.body).toContain('<Name>a</Name>')
  expect(res.body).toContain('<Name>b</Name>')
})

it('5. GetBucketLocation → 200 LocationConstraint XML', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const res = run(store, 'GetBucketLocation', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<LocationConstraint>')
})

// ===========================================================================
// PutObject + metadata + headers
// ===========================================================================

it('6. PutObject → 200 with an ETag header and stored metadata', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const body = Buffer.from('hello world')
  const res = run(store, 'PutObject', {
    bucket: BUCKET,
    key: 'k',
    body,
    contentType: 'text/plain',
    metadata: { 'x-amz-meta-author': 'tom' },
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers.ETag).toBe(quotedMd5(body))
  const stored = store.getObject(BUCKET, 'k')
  expect(stored.contentType).toBe('text/plain')
  expect(stored.metadata).toEqual({ 'x-amz-meta-author': 'tom' })
})

// ===========================================================================
// GetObject / HeadObject headers + range
// ===========================================================================

it('7. GetObject → 200 with the full header set and a Buffer body', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const body = Buffer.from('payload-bytes')
  store.putObject(BUCKET, 'k', {
    body,
    contentType: 'text/plain',
    metadata: { 'x-amz-meta-a': '1' },
  })
  const res = run(store, 'GetObject', { bucket: BUCKET, key: 'k' })
  expect(res.statusCode).toBe(200)
  expect(Buffer.isBuffer(res.body)).toBe(true)
  expect(res.body.equals(body)).toBe(true)
  expect(res.headers.ETag).toBe(quotedMd5(body))
  expect(res.headers['Content-Type']).toBe('text/plain')
  expect(res.headers['Content-Length']).toBe(body.length)
  expect(res.headers['Accept-Ranges']).toBe('bytes')
  expect(res.headers['Last-Modified']).toBeDefined()
  expect(res.headers['x-amz-meta-a']).toBe('1')
})

it('8. GetObject with a Range → 206 and a Content-Range header', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const body = Buffer.from('0123456789')
  store.putObject(BUCKET, 'k', { body })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=2-5',
  })
  expect(res.statusCode).toBe(206)
  expect(res.body.toString()).toBe('2345')
  expect(res.headers['Content-Range']).toBe('bytes 2-5/10')
  expect(res.headers['Content-Length']).toBe(4)
})

it('8a. GetObject with an unsatisfiable Range (start past size) → 416 InvalidRange', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('0123456789') })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=50-60',
  })
  expect(res.statusCode).toBe(416)
})

it('8b. GetObject 416 carries Content-Range bytes */<size> and an XML error body', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('0123456789') })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=50-60',
  })
  expect(res.statusCode).toBe(416)
  expect(res.headers['Content-Range']).toBe('bytes */10')
  expect(res.body).toContain('<Code>InvalidRange</Code>')
  expect(res.body).toContain('<Error>')
})

it('8c. GetObject with a reversed Range (start > end) → 416 InvalidRange', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('0123456789') })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=8-3',
  })
  expect(res.statusCode).toBe(416)
  expect(res.headers['Content-Range']).toBe('bytes */10')
})

it('8d. GetObject with a zero-length suffix Range bytes=-0 → 416 InvalidRange', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('0123456789') })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=-0',
  })
  expect(res.statusCode).toBe(416)
  expect(res.headers['Content-Range']).toBe('bytes */10')
})

it('8e. GetObject with a partially-valid Range (end past size) → 206 clamped', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('0123456789') })
  const res = run(store, 'GetObject', {
    bucket: BUCKET,
    key: 'k',
    range: 'bytes=5-99',
  })
  expect(res.statusCode).toBe(206)
  expect(res.body.toString()).toBe('56789')
  expect(res.headers['Content-Range']).toBe('bytes 5-9/10')
  expect(res.headers['Content-Length']).toBe(5)
})

it('9. GetObject missing key → NoSuchKey (404)', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  expect(() =>
    run(store, 'GetObject', { bucket: BUCKET, key: 'nope' }),
  ).toThrow(expect.objectContaining({ awsCode: 'NoSuchKey', httpStatus: 404 }))
})

it('10. HeadObject → 200, header set, and an empty body', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const body = Buffer.from('abc')
  store.putObject(BUCKET, 'k', { body, contentType: 'text/plain' })
  const res = run(store, 'HeadObject', { bucket: BUCKET, key: 'k' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['Content-Length']).toBe(3)
  expect(res.headers['Content-Type']).toBe('text/plain')
  expect(res.body === '' || res.body === undefined).toBe(true)
})

it('11. HeadObject missing key → NoSuchKey (404)', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  expect(() =>
    run(store, 'HeadObject', { bucket: BUCKET, key: 'nope' }),
  ).toThrow(expect.objectContaining({ awsCode: 'NoSuchKey', httpStatus: 404 }))
})

// ===========================================================================
// Copy
// ===========================================================================

it('12. CopyObject → 200 CopyObjectResult XML and the destination object', () => {
  const store = makeStore()
  store.createBucket('src')
  store.createBucket('dst')
  store.putObject('src', 'a', { body: Buffer.from('copied') })
  const res = run(store, 'CopyObject', {
    bucket: 'dst',
    key: 'b',
    copySource: { bucket: 'src', key: 'a' },
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<CopyObjectResult')
  expect(res.body).toContain('<ETag>')
  expect(store.getObject('dst', 'b').body.toString()).toBe('copied')
})

// ===========================================================================
// Delete
// ===========================================================================

it('13. DeleteObject → 204', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  const res = run(store, 'DeleteObject', { bucket: BUCKET, key: 'k' })
  expect(res.statusCode).toBe(204)
  expect(store.getObject(BUCKET, 'k')).toBeNull()
})

it('14. DeleteObjects parses the XML body and returns DeleteResult XML', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'one', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'two', { body: Buffer.from('2') })
  const body = Buffer.from(
    '<Delete><Object><Key>one</Key></Object><Object><Key>two</Key></Object></Delete>',
  )
  const res = run(store, 'DeleteObjects', { bucket: BUCKET, key: '', body })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<DeleteResult')
  expect(res.body).toContain('<Deleted><Key>one</Key></Deleted>')
  expect(res.body).toContain('<Deleted><Key>two</Key></Deleted>')
  expect(store.getObject(BUCKET, 'one')).toBeNull()
  expect(store.getObject(BUCKET, 'two')).toBeNull()
})

it('15. DeleteObjects honours Quiet by omitting Deleted entries', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'one', { body: Buffer.from('1') })
  const body = Buffer.from(
    '<Delete><Quiet>true</Quiet><Object><Key>one</Key></Object></Delete>',
  )
  const res = run(store, 'DeleteObjects', { bucket: BUCKET, key: '', body })
  expect(res.body).not.toContain('<Deleted>')
})

// ===========================================================================
// List objects
// ===========================================================================

it('16. ListObjectsV2 → 200 XML with the v2 shape', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'a.txt', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b.txt', { body: Buffer.from('2') })
  const res = run(store, 'ListObjectsV2', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<ListBucketResult')
  expect(res.body).toContain('<KeyCount>2</KeyCount>')
  expect(res.body).toContain('<MaxKeys>1000</MaxKeys>')
  expect(res.body).toContain('<Key>a.txt</Key>')
})

it('17. ListObjects (v1) → 200 XML with a Marker element', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'a.txt', { body: Buffer.from('1') })
  const res = run(store, 'ListObjects', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<ListBucketResult')
  expect(res.body).toContain('<Marker>')
  expect(res.body).toContain('<MaxKeys>1000</MaxKeys>')
})

it('17a. ListObjectsV2 echoes the requested MaxKeys while clamping the page to 1000', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  for (let i = 0; i < 1200; i += 1) {
    store.putObject(BUCKET, `k${String(i).padStart(5, '0')}`, {
      body: Buffer.from('x'),
    })
  }
  const res = run(store, 'ListObjectsV2', {
    bucket: BUCKET,
    key: '',
    maxKeys: 5000,
  })
  expect(res.statusCode).toBe(200)
  // The client's requested MaxKeys is echoed verbatim, as real S3 does.
  expect(res.body).toContain('<MaxKeys>5000</MaxKeys>')
  // The page itself is capped at 1000 entries and the listing is truncated.
  expect(res.body).toContain('<KeyCount>1000</KeyCount>')
  expect(res.body).toContain('<IsTruncated>true</IsTruncated>')
})

it('17b. ListObjectsV2 with encodingType=url URL-encodes the keys and emits EncodingType', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'a+b c.txt', { body: Buffer.from('1') })
  const res = run(store, 'ListObjectsV2', {
    bucket: BUCKET,
    key: '',
    encodingType: 'url',
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<EncodingType>url</EncodingType>')
  expect(res.body).toContain('<Key>a%2Bb%20c.txt</Key>')
  expect(decodeURIComponent('a%2Bb%20c.txt')).toBe('a+b c.txt')
})

it('17c. ListObjectsV2 without encodingType returns the raw key', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'a+b c.txt', { body: Buffer.from('1') })
  const res = run(store, 'ListObjectsV2', { bucket: BUCKET, key: '' })
  expect(res.body).not.toContain('EncodingType')
  expect(res.body).toContain('<Key>a+b c.txt</Key>')
})

it('18. ListObjectsV2 on a missing bucket → NoSuchBucket (404)', () => {
  const store = makeStore()
  expect(() =>
    run(store, 'ListObjectsV2', { bucket: 'ghost', key: '' }),
  ).toThrow(
    expect.objectContaining({ awsCode: 'NoSuchBucket', httpStatus: 404 }),
  )
})

// ===========================================================================
// Multipart
// ===========================================================================

it('19. CreateMultipartUpload → 200 InitiateMultipartUploadResult XML', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const res = run(store, 'CreateMultipartUpload', { bucket: BUCKET, key: 'k' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<InitiateMultipartUploadResult')
  expect(res.body).toContain('<UploadId>')
})

it('20. UploadPart → 200 with an ETag header', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  const body = Buffer.from('part-one-bytes')
  const res = run(store, 'UploadPart', {
    bucket: BUCKET,
    key: 'k',
    uploadId,
    partNumber: 1,
    body,
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers.ETag).toBe(quotedMd5(body))
})

it('21. CompleteMultipartUpload parses the XML body and returns the result XML', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  const partBody = Buffer.from('the-only-part')
  const { etag } = store.uploadPart(BUCKET, 'k', uploadId, 1, partBody)
  const body = Buffer.from(
    `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>${etag}</ETag></Part></CompleteMultipartUpload>`,
  )
  const res = run(store, 'CompleteMultipartUpload', {
    bucket: BUCKET,
    key: 'k',
    uploadId,
    body,
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<CompleteMultipartUploadResult')
  expect(res.body).toContain(
    '<Location>http://localhost/my-bucket/k</Location>',
  )
  expect(store.getObject(BUCKET, 'k').body.toString()).toBe('the-only-part')
})

it('22. CompleteMultipartUpload with parts out of order → InvalidPartOrder (400)', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  const p1 = store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('aaaaa'))
  const p2 = store.uploadPart(BUCKET, 'k', uploadId, 2, Buffer.from('bbbbb'))
  const body = Buffer.from(
    `<CompleteMultipartUpload>` +
      `<Part><PartNumber>2</PartNumber><ETag>${p2.etag}</ETag></Part>` +
      `<Part><PartNumber>1</PartNumber><ETag>${p1.etag}</ETag></Part>` +
      `</CompleteMultipartUpload>`,
  )
  expect(() =>
    run(store, 'CompleteMultipartUpload', {
      bucket: BUCKET,
      key: 'k',
      uploadId,
      body,
    }),
  ).toThrow(
    expect.objectContaining({ awsCode: 'InvalidPartOrder', httpStatus: 400 }),
  )
})

it('23. AbortMultipartUpload → 204', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  const res = run(store, 'AbortMultipartUpload', {
    bucket: BUCKET,
    key: 'k',
    uploadId,
  })
  expect(res.statusCode).toBe(204)
})

it('24. AbortMultipartUpload on an unknown upload → NoSuchUpload (404)', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  expect(() =>
    run(store, 'AbortMultipartUpload', {
      bucket: BUCKET,
      key: 'k',
      uploadId: 'ghost',
    }),
  ).toThrow(
    expect.objectContaining({ awsCode: 'NoSuchUpload', httpStatus: 404 }),
  )
})

it('25. ListMultipartUploads → 200 XML', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  store.createMultipartUpload(BUCKET, 'k')
  const res = run(store, 'ListMultipartUploads', { bucket: BUCKET, key: '' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<ListMultipartUploadsResult')
})

it('26. ListParts → 200 XML with each part', () => {
  const store = makeStore()
  store.createBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('xyz'))
  const res = run(store, 'ListParts', { bucket: BUCKET, key: 'k', uploadId })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<ListPartsResult')
  expect(res.body).toContain('<PartNumber>1</PartNumber>')
})

it('27. UploadPartCopy → 200 CopyPartResult XML', () => {
  const store = makeStore()
  store.createBucket('src')
  store.createBucket(BUCKET)
  store.putObject('src', 'a', { body: Buffer.from('source-object') })
  const uploadId = store.createMultipartUpload(BUCKET, 'k')
  const res = run(store, 'UploadPartCopy', {
    bucket: BUCKET,
    key: 'k',
    uploadId,
    partNumber: 1,
    copySource: { bucket: 'src', key: 'a' },
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toContain('<CopyPartResult')
  expect(res.body).toContain('<ETag>')
})

// ===========================================================================
// Error class
// ===========================================================================

it('28. S3OpError carries awsCode, httpStatus and message', () => {
  const error = new S3OpError('NoSuchKey', 404, 'missing')
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe('S3OpError')
  expect(error.awsCode).toBe('NoSuchKey')
  expect(error.httpStatus).toBe(404)
  expect(error.message).toBe('missing')
})
