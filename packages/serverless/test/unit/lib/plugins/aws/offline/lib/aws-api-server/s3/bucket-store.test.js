import { createHash } from 'node:crypto'
import { createBucketStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/bucket-store.js'

const BUCKET = 'my-bucket'

/**
 * Build a mutable clock for injection. `set(ms)` pins simulated time so
 * `lastModified` assertions never depend on real timers.
 */
function makeClock(start = 1_700_000_000_000) {
  let t = start
  return {
    now: () => t,
    tick(ms) {
      t += ms
    },
    set(ms) {
      t = ms
    },
  }
}

/** Quoted hex md5 ETag, matching the store's format. */
function quotedMd5(buffer) {
  return '"' + createHash('md5').update(buffer).digest('hex') + '"'
}

/** Raw 16-byte md5 digest of a buffer. */
function md5Digest(buffer) {
  return createHash('md5').update(buffer).digest()
}

// ===========================================================================
// Buckets
// ===========================================================================

it('1. createBucket then hasBucket reports true; unknown bucket is false', () => {
  const store = createBucketStore()
  store.createBucket(BUCKET)
  expect(store.hasBucket(BUCKET)).toBe(true)
  expect(store.hasBucket('nope')).toBe(false)
})

it('2. createBucket is idempotent (re-create keeps existing objects)', () => {
  const store = createBucketStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  store.createBucket(BUCKET)
  expect(store.getObject(BUCKET, 'k').body.toString()).toBe('v')
})

it('3. ensureBucket creates a bucket if missing and is idempotent', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.ensureBucket(BUCKET)
  expect(store.hasBucket(BUCKET)).toBe(true)
})

it('4. listBuckets returns name + createdAt for each bucket', () => {
  const clock = makeClock()
  const store = createBucketStore({ now: clock.now })
  store.createBucket('a')
  clock.tick(1000)
  store.createBucket('b')
  const buckets = store.listBuckets()
  expect(buckets.map((b) => b.name).sort()).toEqual(['a', 'b'])
  const a = buckets.find((b) => b.name === 'a')
  expect(typeof a.createdAt).toBe('number')
})

it('5. deleteBucket removes an empty bucket', () => {
  const store = createBucketStore()
  store.createBucket(BUCKET)
  store.deleteBucket(BUCKET)
  expect(store.hasBucket(BUCKET)).toBe(false)
})

it('6. deleteBucket throws BucketNotEmpty when objects remain', () => {
  const store = createBucketStore()
  store.createBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  expect(() => store.deleteBucket(BUCKET)).toThrow(
    expect.objectContaining({ code: 'BucketNotEmpty' }),
  )
})

// ===========================================================================
// Object round-trips + ETag format
// ===========================================================================

it('7. putObject returns a quoted hex md5 ETag', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('hello world')
  const { etag } = store.putObject(BUCKET, 'k', { body })
  expect(etag).toBe(quotedMd5(body))
})

it('8. getObject round-trips body, contentType, metadata, size, lastModified', () => {
  const clock = makeClock()
  const store = createBucketStore({ now: clock.now })
  store.ensureBucket(BUCKET)
  const body = Buffer.from('payload-bytes')
  store.putObject(BUCKET, 'k', {
    body,
    contentType: 'text/plain',
    metadata: { 'x-amz-meta-author': 'tom' },
  })
  const obj = store.getObject(BUCKET, 'k')
  expect(obj.body.equals(body)).toBe(true)
  expect(obj.contentType).toBe('text/plain')
  expect(obj.metadata).toEqual({ 'x-amz-meta-author': 'tom' })
  expect(obj.size).toBe(body.length)
  expect(obj.etag).toBe(quotedMd5(body))
  expect(obj.lastModified).toBe(clock.now())
})

it('9. putObject defaults contentType to binary/octet-stream', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('x') })
  expect(store.getObject(BUCKET, 'k').contentType).toBe('binary/octet-stream')
})

it('10. getObject returns null for a missing key or missing bucket', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  expect(store.getObject(BUCKET, 'missing')).toBeNull()
  expect(store.getObject('no-bucket', 'k')).toBeNull()
})

it('11. headObject returns metadata without the body', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('abc')
  store.putObject(BUCKET, 'k', { body, contentType: 'application/json' })
  const head = store.headObject(BUCKET, 'k')
  expect(head.body).toBeUndefined()
  expect(head.size).toBe(3)
  expect(head.contentType).toBe('application/json')
  expect(head.etag).toBe(quotedMd5(body))
})

it('12. headObject returns null for a missing key', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  expect(store.headObject(BUCKET, 'missing')).toBeNull()
})

it('13. putObject overwrites an existing key (new ETag, new body)', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('old') })
  const newBody = Buffer.from('new-content')
  const { etag } = store.putObject(BUCKET, 'k', { body: newBody })
  expect(etag).toBe(quotedMd5(newBody))
  expect(store.getObject(BUCKET, 'k').body.toString()).toBe('new-content')
})

it('14. putObject throws NoSuchBucket when the bucket does not exist', () => {
  const store = createBucketStore()
  expect(() =>
    store.putObject('absent', 'k', { body: Buffer.from('x') }),
  ).toThrow(expect.objectContaining({ code: 'NoSuchBucket' }))
})

// ===========================================================================
// Delete (single + batch)
// ===========================================================================

it('15. deleteObject removes a key', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  store.deleteObject(BUCKET, 'k')
  expect(store.getObject(BUCKET, 'k')).toBeNull()
})

it('16. deleteObject is idempotent (deleting a missing key is a no-op)', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  expect(() => store.deleteObject(BUCKET, 'missing')).not.toThrow()
})

it('17. deleteObjects deletes a batch and reports each deleted key', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b', { body: Buffer.from('2') })
  store.putObject(BUCKET, 'c', { body: Buffer.from('3') })
  const result = store.deleteObjects(BUCKET, ['a', 'b', 'missing'])
  expect(result.deleted.map((d) => d.key).sort()).toEqual(['a', 'b', 'missing'])
  expect(result.errors).toEqual([])
  expect(store.getObject(BUCKET, 'c').body.toString()).toBe('3')
})

// ===========================================================================
// Range requests
// ===========================================================================

it('18. getObject range bytes=start-end slices the body + sets contentRange', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('0123456789')
  store.putObject(BUCKET, 'k', { body })
  const obj = store.getObject(BUCKET, 'k', { range: 'bytes=2-5' })
  expect(obj.body.toString()).toBe('2345')
  expect(obj.contentRange).toBe('bytes 2-5/10')
})

it('19. getObject open-ended range bytes=4- goes to the end', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('0123456789')
  store.putObject(BUCKET, 'k', { body })
  const obj = store.getObject(BUCKET, 'k', { range: 'bytes=4-' })
  expect(obj.body.toString()).toBe('456789')
  expect(obj.contentRange).toBe('bytes 4-9/10')
})

it('20. getObject suffix range bytes=-3 returns the last N bytes', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('0123456789')
  store.putObject(BUCKET, 'k', { body })
  const obj = store.getObject(BUCKET, 'k', { range: 'bytes=-3' })
  expect(obj.body.toString()).toBe('789')
  expect(obj.contentRange).toBe('bytes 7-9/10')
})

it('21. getObject without a range returns the full body and no contentRange', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('full') })
  const obj = store.getObject(BUCKET, 'k')
  expect(obj.body.toString()).toBe('full')
  expect(obj.contentRange).toBeUndefined()
})

// ===========================================================================
// Copy
// ===========================================================================

it('22. copyObject copies within the same bucket (default COPY metadata)', () => {
  const clock = makeClock()
  const store = createBucketStore({ now: clock.now })
  store.ensureBucket(BUCKET)
  const body = Buffer.from('source-bytes')
  store.putObject(BUCKET, 'src', {
    body,
    contentType: 'text/csv',
    metadata: { 'x-amz-meta-k': 'v' },
  })
  clock.tick(5000)
  const result = store.copyObject({
    srcBucket: BUCKET,
    srcKey: 'src',
    dstBucket: BUCKET,
    dstKey: 'dst',
  })
  expect(result.etag).toBe(quotedMd5(body))
  expect(result.lastModified).toBe(clock.now())
  const dst = store.getObject(BUCKET, 'dst')
  expect(dst.body.equals(body)).toBe(true)
  expect(dst.contentType).toBe('text/csv')
  expect(dst.metadata).toEqual({ 'x-amz-meta-k': 'v' })
})

it('23. copyObject across buckets', () => {
  const store = createBucketStore()
  store.ensureBucket('src-bucket')
  store.ensureBucket('dst-bucket')
  const body = Buffer.from('inter-bucket')
  store.putObject('src-bucket', 'k', { body })
  store.copyObject({
    srcBucket: 'src-bucket',
    srcKey: 'k',
    dstBucket: 'dst-bucket',
    dstKey: 'copy',
  })
  expect(store.getObject('dst-bucket', 'copy').body.equals(body)).toBe(true)
})

it('24. copyObject metadataDirective REPLACE uses new metadata/contentType', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'src', {
    body: Buffer.from('x'),
    contentType: 'text/plain',
    metadata: { 'x-amz-meta-old': '1' },
  })
  store.copyObject({
    srcBucket: BUCKET,
    srcKey: 'src',
    dstBucket: BUCKET,
    dstKey: 'dst',
    metadataDirective: 'REPLACE',
    contentType: 'application/json',
    metadata: { 'x-amz-meta-new': '2' },
  })
  const dst = store.getObject(BUCKET, 'dst')
  expect(dst.contentType).toBe('application/json')
  expect(dst.metadata).toEqual({ 'x-amz-meta-new': '2' })
})

it('25. copyObject throws NoSuchKey when the source is missing', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  expect(() =>
    store.copyObject({
      srcBucket: BUCKET,
      srcKey: 'missing',
      dstBucket: BUCKET,
      dstKey: 'dst',
    }),
  ).toThrow(expect.objectContaining({ code: 'NoSuchKey' }))
})

// ===========================================================================
// listObjectsV2
// ===========================================================================

it('26. listObjectsV2 returns contents sorted lexicographically with keyCount', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'banana', { body: Buffer.from('b') })
  store.putObject(BUCKET, 'apple', { body: Buffer.from('a') })
  store.putObject(BUCKET, 'cherry', { body: Buffer.from('c') })
  const result = store.listObjectsV2(BUCKET, {})
  expect(result.contents.map((c) => c.key)).toEqual([
    'apple',
    'banana',
    'cherry',
  ])
  expect(result.keyCount).toBe(3)
  expect(result.isTruncated).toBe(false)
  const apple = result.contents[0]
  expect(apple.size).toBe(1)
  expect(apple.etag).toBe(quotedMd5(Buffer.from('a')))
  expect(typeof apple.lastModified).toBe('number')
})

it('27. listObjectsV2 prefix filters keys', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'photos/1.jpg', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'photos/2.jpg', { body: Buffer.from('2') })
  store.putObject(BUCKET, 'docs/a.txt', { body: Buffer.from('a') })
  const result = store.listObjectsV2(BUCKET, { prefix: 'photos/' })
  expect(result.contents.map((c) => c.key)).toEqual([
    'photos/1.jpg',
    'photos/2.jpg',
  ])
})

it('28. listObjectsV2 delimiter rolls keys up into commonPrefixes', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'photos/1.jpg', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'photos/2.jpg', { body: Buffer.from('2') })
  store.putObject(BUCKET, 'docs/a.txt', { body: Buffer.from('a') })
  store.putObject(BUCKET, 'top.txt', { body: Buffer.from('t') })
  const result = store.listObjectsV2(BUCKET, { delimiter: '/' })
  expect(result.commonPrefixes.sort()).toEqual(['docs/', 'photos/'])
  expect(result.contents.map((c) => c.key)).toEqual(['top.txt'])
})

it('29. listObjectsV2 maxKeys truncates + nextContinuationToken round-trips', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  for (const k of ['k1', 'k2', 'k3', 'k4', 'k5']) {
    store.putObject(BUCKET, k, { body: Buffer.from(k) })
  }
  const page1 = store.listObjectsV2(BUCKET, { maxKeys: 2 })
  expect(page1.contents.map((c) => c.key)).toEqual(['k1', 'k2'])
  expect(page1.isTruncated).toBe(true)
  expect(page1.keyCount).toBe(2)
  expect(page1.nextContinuationToken).toBeTruthy()

  const page2 = store.listObjectsV2(BUCKET, {
    maxKeys: 2,
    continuationToken: page1.nextContinuationToken,
  })
  expect(page2.contents.map((c) => c.key)).toEqual(['k3', 'k4'])
  expect(page2.isTruncated).toBe(true)

  const page3 = store.listObjectsV2(BUCKET, {
    maxKeys: 2,
    continuationToken: page2.nextContinuationToken,
  })
  expect(page3.contents.map((c) => c.key)).toEqual(['k5'])
  expect(page3.isTruncated).toBe(false)
  expect(page3.nextContinuationToken).toBeUndefined()
})

it('30. listObjectsV2 startAfter skips keys at or before the marker', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  for (const k of ['a', 'b', 'c', 'd']) {
    store.putObject(BUCKET, k, { body: Buffer.from(k) })
  }
  const result = store.listObjectsV2(BUCKET, { startAfter: 'b' })
  expect(result.contents.map((c) => c.key)).toEqual(['c', 'd'])
})

it('30a. listObjectsV2 maxKeys=0 returns an empty 200-shape list (no crash, no token)', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('a') })
  store.putObject(BUCKET, 'b', { body: Buffer.from('b') })
  const result = store.listObjectsV2(BUCKET, { maxKeys: 0 })
  expect(result.contents).toEqual([])
  expect(result.commonPrefixes).toEqual([])
  expect(result.isTruncated).toBe(false)
  expect(result.keyCount).toBe(0)
  expect(result.nextContinuationToken).toBeUndefined()
})

it('30b. listObjectsV2 with no matching keys returns an empty list without a token', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('a') })
  const result = store.listObjectsV2(BUCKET, { prefix: 'no-match/' })
  expect(result.contents).toEqual([])
  expect(result.isTruncated).toBe(false)
  expect(result.keyCount).toBe(0)
  expect(result.nextContinuationToken).toBeUndefined()
})

it('30c. listObjectsV2 paginates a delimited listing without re-rolling a prefix across a page boundary', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  // Two keys roll into the `b/` prefix; the page boundary falls on that
  // prefix, so a naive token (the prefix value `b/`) would re-roll it.
  store.putObject(BUCKET, 'a', { body: Buffer.from('a') })
  store.putObject(BUCKET, 'b/1', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b/2', { body: Buffer.from('2') })
  store.putObject(BUCKET, 'c', { body: Buffer.from('c') })

  const seenPrefixes = []
  const seenKeys = []
  let token
  let guard = 0
  do {
    const page = store.listObjectsV2(BUCKET, {
      delimiter: '/',
      maxKeys: 2,
      continuationToken: token,
    })
    seenKeys.push(...page.contents.map((entry) => entry.key))
    seenPrefixes.push(...page.commonPrefixes)
    token = page.isTruncated ? page.nextContinuationToken : undefined
    if (++guard > 20) throw new Error('pagination did not terminate')
  } while (token)

  expect(seenKeys).toEqual(['a', 'c'])
  // The `b/` prefix is emitted exactly once across all pages.
  expect(seenPrefixes).toEqual(['b/'])
})

it('30d. listObjectsV2 clamps the effective page size to 1000 but isTruncated reflects the cap', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  for (let i = 0; i < 1500; i += 1) {
    const key = `k${String(i).padStart(5, '0')}`
    store.putObject(BUCKET, key, { body: Buffer.from('x') })
  }
  const result = store.listObjectsV2(BUCKET, { maxKeys: 5000 })
  expect(result.contents).toHaveLength(1000)
  expect(result.isTruncated).toBe(true)
  expect(result.nextContinuationToken).toBeTruthy()
})

// ===========================================================================
// listObjects (v1)
// ===========================================================================

it('31. listObjects (v1) returns the v1 shape with nextMarker when truncated', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  for (const k of ['a', 'b', 'c']) {
    store.putObject(BUCKET, k, { body: Buffer.from(k) })
  }
  const page1 = store.listObjects(BUCKET, { maxKeys: 2 })
  expect(page1.contents.map((c) => c.key)).toEqual(['a', 'b'])
  expect(page1.isTruncated).toBe(true)
  expect(page1.nextMarker).toBe('b')

  const page2 = store.listObjects(BUCKET, { maxKeys: 2, marker: 'b' })
  expect(page2.contents.map((c) => c.key)).toEqual(['c'])
  expect(page2.isTruncated).toBe(false)
})

it('32. listObjects (v1) delimiter produces commonPrefixes', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a/1', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b/1', { body: Buffer.from('1') })
  const result = store.listObjects(BUCKET, { delimiter: '/' })
  expect(result.commonPrefixes.sort()).toEqual(['a/', 'b/'])
})

it('32a. listObjects (v1) maxKeys=0 returns an empty list without a marker', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('a') })
  const result = store.listObjects(BUCKET, { maxKeys: 0 })
  expect(result.contents).toEqual([])
  expect(result.commonPrefixes).toEqual([])
  expect(result.isTruncated).toBe(false)
  expect(result.nextMarker).toBeUndefined()
})

it('32b. listObjects (v1) paginates a delimited listing without re-rolling a prefix', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('a') })
  store.putObject(BUCKET, 'b/1', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b/2', { body: Buffer.from('2') })
  store.putObject(BUCKET, 'c', { body: Buffer.from('c') })

  const seenPrefixes = []
  const seenKeys = []
  let marker
  let guard = 0
  do {
    const page = store.listObjects(BUCKET, {
      delimiter: '/',
      maxKeys: 2,
      marker,
    })
    seenKeys.push(...page.contents.map((entry) => entry.key))
    seenPrefixes.push(...page.commonPrefixes)
    marker = page.isTruncated ? page.nextMarker : undefined
    if (++guard > 20) throw new Error('pagination did not terminate')
  } while (marker)

  expect(seenKeys).toEqual(['a', 'c'])
  expect(seenPrefixes).toEqual(['b/'])
})

// ===========================================================================
// Multipart lifecycle
// ===========================================================================

it('33. multipart full lifecycle yields the exact composite ETag', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'big', {
    contentType: 'application/zip',
  })
  expect(typeof uploadId).toBe('string')

  const part1 = Buffer.from('a'.repeat(20))
  const part2 = Buffer.from('b'.repeat(15))
  const r1 = store.uploadPart(BUCKET, 'big', uploadId, 1, part1)
  const r2 = store.uploadPart(BUCKET, 'big', uploadId, 2, part2)
  expect(r1.etag).toBe(quotedMd5(part1))
  expect(r2.etag).toBe(quotedMd5(part2))

  const { etag } = store.completeMultipartUpload(BUCKET, 'big', uploadId, [
    { partNumber: 1, etag: r1.etag },
    { partNumber: 2, etag: r2.etag },
  ])

  const expectedComposite =
    '"' +
    createHash('md5')
      .update(Buffer.concat([md5Digest(part1), md5Digest(part2)]))
      .digest('hex') +
    '-2"'
  expect(etag).toBe(expectedComposite)

  const obj = store.getObject(BUCKET, 'big')
  expect(obj.body.equals(Buffer.concat([part1, part2]))).toBe(true)
  expect(obj.contentType).toBe('application/zip')
  expect(obj.etag).toBe(expectedComposite)
})

it('34. completeMultipartUpload concatenates parts in partNumber order', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'ordered', {})
  const p1 = Buffer.from('AAAA')
  const p2 = Buffer.from('BBBB')
  // Upload out of order; completion still concatenates by partNumber.
  const r2 = store.uploadPart(BUCKET, 'ordered', uploadId, 2, p2)
  const r1 = store.uploadPart(BUCKET, 'ordered', uploadId, 1, p1)
  store.completeMultipartUpload(BUCKET, 'ordered', uploadId, [
    { partNumber: 1, etag: r1.etag },
    { partNumber: 2, etag: r2.etag },
  ])
  expect(store.getObject(BUCKET, 'ordered').body.toString()).toBe('AAAABBBB')
})

it('35. completeMultipartUpload throws InvalidPartOrder for descending part numbers', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const r1 = store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('1'))
  const r2 = store.uploadPart(BUCKET, 'k', uploadId, 2, Buffer.from('2'))
  expect(() =>
    store.completeMultipartUpload(BUCKET, 'k', uploadId, [
      { partNumber: 2, etag: r2.etag },
      { partNumber: 1, etag: r1.etag },
    ]),
  ).toThrow(expect.objectContaining({ code: 'InvalidPartOrder' }))
})

it('36. completeMultipartUpload throws InvalidPart for a mismatched etag', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('1'))
  expect(() =>
    store.completeMultipartUpload(BUCKET, 'k', uploadId, [
      { partNumber: 1, etag: '"deadbeef"' },
    ]),
  ).toThrow(expect.objectContaining({ code: 'InvalidPart' }))
})

it('37. completeMultipartUpload throws InvalidPart when a referenced part is absent', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const r1 = store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('1'))
  expect(() =>
    store.completeMultipartUpload(BUCKET, 'k', uploadId, [
      { partNumber: 1, etag: r1.etag },
      { partNumber: 2, etag: '"missing"' },
    ]),
  ).toThrow(expect.objectContaining({ code: 'InvalidPart' }))
})

it('38. completeMultipartUpload removes the upload', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const r1 = store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('1'))
  store.completeMultipartUpload(BUCKET, 'k', uploadId, [
    { partNumber: 1, etag: r1.etag },
  ])
  expect(store.listMultipartUploads(BUCKET)).toEqual([])
  expect(() =>
    store.uploadPart(BUCKET, 'k', uploadId, 2, Buffer.from('2')),
  ).toThrow(expect.objectContaining({ code: 'NoSuchUpload' }))
})

it('39. uploadPart throws NoSuchUpload for an unknown upload id', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  expect(() =>
    store.uploadPart(BUCKET, 'k', 'no-such-id', 1, Buffer.from('1')),
  ).toThrow(expect.objectContaining({ code: 'NoSuchUpload' }))
})

it('40. createMultipartUpload throws NoSuchBucket when the bucket is missing', () => {
  const store = createBucketStore()
  expect(() => store.createMultipartUpload('absent', 'k', {})).toThrow(
    expect.objectContaining({ code: 'NoSuchBucket' }),
  )
})

it('41. abortMultipartUpload discards the upload', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  store.uploadPart(BUCKET, 'k', uploadId, 1, Buffer.from('1'))
  store.abortMultipartUpload(BUCKET, 'k', uploadId)
  expect(store.listMultipartUploads(BUCKET)).toEqual([])
  expect(() => store.abortMultipartUpload(BUCKET, 'k', uploadId)).toThrow(
    expect.objectContaining({ code: 'NoSuchUpload' }),
  )
})

it('42. listMultipartUploads reports key, uploadId, initiated', () => {
  const clock = makeClock()
  const store = createBucketStore({ now: clock.now })
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const uploads = store.listMultipartUploads(BUCKET)
  expect(uploads).toHaveLength(1)
  expect(uploads[0].key).toBe('k')
  expect(uploads[0].uploadId).toBe(uploadId)
  expect(uploads[0].initiated).toBe(clock.now())
})

it('43. listParts reports partNumber, etag, size, lastModified', () => {
  const clock = makeClock()
  const store = createBucketStore({ now: clock.now })
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const body = Buffer.from('part-body')
  const r1 = store.uploadPart(BUCKET, 'k', uploadId, 1, body)
  const { parts } = store.listParts(BUCKET, 'k', uploadId)
  expect(parts).toHaveLength(1)
  expect(parts[0].partNumber).toBe(1)
  expect(parts[0].etag).toBe(r1.etag)
  expect(parts[0].size).toBe(body.length)
  expect(parts[0].lastModified).toBe(clock.now())
})

it('44. uploadPartCopy copies a source object range into a part', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'src', { body: Buffer.from('0123456789') })
  const uploadId = store.createMultipartUpload(BUCKET, 'dst', {})
  const r = store.uploadPartCopy(BUCKET, 'dst', uploadId, 1, {
    srcBucket: BUCKET,
    srcKey: 'src',
    range: 'bytes=2-5',
  })
  expect(r.etag).toBe(quotedMd5(Buffer.from('2345')))
  const { parts } = store.listParts(BUCKET, 'dst', uploadId)
  expect(parts[0].size).toBe(4)
})

it('45. uploadPartCopy without a range copies the whole source object', () => {
  const store = createBucketStore()
  store.ensureBucket(BUCKET)
  const body = Buffer.from('whole-source')
  store.putObject(BUCKET, 'src', { body })
  const uploadId = store.createMultipartUpload(BUCKET, 'dst', {})
  const r = store.uploadPartCopy(BUCKET, 'dst', uploadId, 1, {
    srcBucket: BUCKET,
    srcKey: 'src',
  })
  expect(r.etag).toBe(quotedMd5(body))
})

// ===========================================================================
// onMutation hook
// ===========================================================================

it('46. onMutation fires on putObject with ObjectCreated:Put + size + etag', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  const body = Buffer.from('hello')
  store.putObject(BUCKET, 'k', { body })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    bucket: BUCKET,
    key: 'k',
    eventName: 'ObjectCreated:Put',
    size: body.length,
    etag: quotedMd5(body),
  })
  expect(typeof events[0].sequencer).toBe('string')
})

it('47. onMutation fires on copyObject with ObjectCreated:Copy', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'src', { body: Buffer.from('x') })
  events.length = 0
  store.copyObject({
    srcBucket: BUCKET,
    srcKey: 'src',
    dstBucket: BUCKET,
    dstKey: 'dst',
  })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    bucket: BUCKET,
    key: 'dst',
    eventName: 'ObjectCreated:Copy',
  })
})

it('48. onMutation fires on completeMultipartUpload with ObjectCreated:CompleteMultipartUpload', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  const uploadId = store.createMultipartUpload(BUCKET, 'k', {})
  const part = Buffer.from('multipart-body')
  const r1 = store.uploadPart(BUCKET, 'k', uploadId, 1, part)
  events.length = 0
  const { etag } = store.completeMultipartUpload(BUCKET, 'k', uploadId, [
    { partNumber: 1, etag: r1.etag },
  ])
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    bucket: BUCKET,
    key: 'k',
    eventName: 'ObjectCreated:CompleteMultipartUpload',
    size: part.length,
    etag,
  })
})

it('49. onMutation fires on deleteObject with ObjectRemoved:Delete only when it existed', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'k', { body: Buffer.from('v') })
  events.length = 0
  store.deleteObject(BUCKET, 'k')
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    bucket: BUCKET,
    key: 'k',
    eventName: 'ObjectRemoved:Delete',
  })
  events.length = 0
  store.deleteObject(BUCKET, 'k')
  expect(events).toEqual([])
})

it('50. onMutation sequencer is monotonic across mutations', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b', { body: Buffer.from('2') })
  const [first, second] = events
  expect(parseInt(second.sequencer, 16) > parseInt(first.sequencer, 16)).toBe(
    true,
  )
})

it('51. deleteObjects fires onMutation for each existing key', () => {
  const events = []
  const store = createBucketStore({ onMutation: (e) => events.push(e) })
  store.ensureBucket(BUCKET)
  store.putObject(BUCKET, 'a', { body: Buffer.from('1') })
  store.putObject(BUCKET, 'b', { body: Buffer.from('2') })
  events.length = 0
  store.deleteObjects(BUCKET, ['a', 'b', 'missing'])
  expect(events.map((e) => e.key).sort()).toEqual(['a', 'b'])
  expect(events.every((e) => e.eventName === 'ObjectRemoved:Delete')).toBe(true)
})

// ===========================================================================
// Bucket-not-found across object ops
// ===========================================================================

it('52. listObjectsV2 throws NoSuchBucket for an unknown bucket', () => {
  const store = createBucketStore()
  expect(() => store.listObjectsV2('absent', {})).toThrow(
    expect.objectContaining({ code: 'NoSuchBucket' }),
  )
})
