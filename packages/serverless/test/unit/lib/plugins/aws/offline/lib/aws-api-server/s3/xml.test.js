import {
  serializeListAllMyBuckets,
  serializeListBucketResultV2,
  serializeListBucketResultV1,
  serializeInitiateMultipartUpload,
  serializeCompleteMultipartUpload,
  serializeCopyObjectResult,
  serializeCopyPartResult,
  serializeListMultipartUploads,
  serializeListParts,
  serializeDeleteResult,
  serializeLocationConstraint,
  serializeError,
  parseDeleteRequest,
  parseCompleteMultipartUpload,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/xml.js'

const ISO = '2023-11-14T22:13:20.000Z'
const MS = Date.parse(ISO)

// ===========================================================================
// ListAllMyBucketsResult
// ===========================================================================

it('1. serializeListAllMyBuckets renders an Owner + a Bucket per entry', () => {
  const xml = serializeListAllMyBuckets([
    { name: 'a', createdAt: MS },
    { name: 'b', createdAt: MS },
  ])
  expect(xml).toContain('<?xml')
  expect(xml).toContain('<ListAllMyBucketsResult')
  expect(xml).toContain('<Name>a</Name>')
  expect(xml).toContain('<Name>b</Name>')
  expect(xml).toContain(`<CreationDate>${ISO}</CreationDate>`)
})

// ===========================================================================
// ListBucketResult v2
// ===========================================================================

it('2. serializeListBucketResultV2 renders v2 fields, Contents and CommonPrefixes', () => {
  const xml = serializeListBucketResultV2({
    name: 'my-bucket',
    prefix: 'p/',
    delimiter: '/',
    maxKeys: 1000,
    keyCount: 1,
    isTruncated: false,
    contents: [
      {
        key: 'p/file.txt',
        lastModified: MS,
        etag: '"abc"',
        size: 12,
      },
    ],
    commonPrefixes: ['p/sub/'],
  })
  expect(xml).toContain('<ListBucketResult')
  expect(xml).toContain('<Name>my-bucket</Name>')
  expect(xml).toContain('<Prefix>p/</Prefix>')
  expect(xml).toContain('<KeyCount>1</KeyCount>')
  expect(xml).toContain('<MaxKeys>1000</MaxKeys>')
  expect(xml).toContain('<Delimiter>/</Delimiter>')
  expect(xml).toContain('<IsTruncated>false</IsTruncated>')
  expect(xml).toContain('<Key>p/file.txt</Key>')
  expect(xml).toContain(`<LastModified>${ISO}</LastModified>`)
  expect(xml).toContain('<ETag>&quot;abc&quot;</ETag>')
  expect(xml).toContain('<Size>12</Size>')
  expect(xml).toContain('<StorageClass>STANDARD</StorageClass>')
  expect(xml).toContain(
    '<CommonPrefixes><Prefix>p/sub/</Prefix></CommonPrefixes>',
  )
})

it('3. serializeListBucketResultV2 emits NextContinuationToken only when truncated', () => {
  const truncated = serializeListBucketResultV2({
    name: 'b',
    maxKeys: 1,
    keyCount: 1,
    isTruncated: true,
    nextContinuationToken: 'next',
    contents: [],
    commonPrefixes: [],
  })
  expect(truncated).toContain('<IsTruncated>true</IsTruncated>')
  expect(truncated).toContain(
    '<NextContinuationToken>next</NextContinuationToken>',
  )

  const full = serializeListBucketResultV2({
    name: 'b',
    maxKeys: 1000,
    keyCount: 0,
    isTruncated: false,
    contents: [],
    commonPrefixes: [],
  })
  expect(full).not.toContain('NextContinuationToken')
})

// ===========================================================================
// ListBucketResult v1
// ===========================================================================

it('4. serializeListBucketResultV1 renders Marker and NextMarker when truncated', () => {
  const xml = serializeListBucketResultV1({
    name: 'b',
    prefix: '',
    maxKeys: 1,
    marker: 'm0',
    isTruncated: true,
    nextMarker: 'm1',
    contents: [{ key: 'k', lastModified: MS, etag: '"e"', size: 3 }],
    commonPrefixes: [],
  })
  expect(xml).toContain('<ListBucketResult')
  expect(xml).toContain('<Marker>m0</Marker>')
  expect(xml).toContain('<NextMarker>m1</NextMarker>')
  expect(xml).not.toContain('KeyCount')
})

// ===========================================================================
// Multipart serializers
// ===========================================================================

it('5. serializeInitiateMultipartUpload renders Bucket/Key/UploadId', () => {
  const xml = serializeInitiateMultipartUpload({
    bucket: 'b',
    key: 'k',
    uploadId: 'u',
  })
  expect(xml).toContain('<InitiateMultipartUploadResult')
  expect(xml).toContain('<Bucket>b</Bucket>')
  expect(xml).toContain('<Key>k</Key>')
  expect(xml).toContain('<UploadId>u</UploadId>')
})

it('6. serializeCompleteMultipartUpload renders Location/Bucket/Key/ETag', () => {
  const xml = serializeCompleteMultipartUpload({
    location: 'http://localhost/b/k',
    bucket: 'b',
    key: 'k',
    etag: '"e-2"',
  })
  expect(xml).toContain('<CompleteMultipartUploadResult')
  expect(xml).toContain('<Location>http://localhost/b/k</Location>')
  expect(xml).toContain('<Bucket>b</Bucket>')
  expect(xml).toContain('<Key>k</Key>')
  expect(xml).toContain('<ETag>&quot;e-2&quot;</ETag>')
})

it('7. serializeListMultipartUploads renders an Upload per entry', () => {
  const xml = serializeListMultipartUploads({
    bucket: 'b',
    uploads: [
      { key: 'k1', uploadId: 'u1', initiated: MS },
      { key: 'k2', uploadId: 'u2', initiated: MS },
    ],
  })
  expect(xml).toContain('<ListMultipartUploadsResult')
  expect(xml).toContain('<Bucket>b</Bucket>')
  expect(xml).toContain('<Upload><Key>k1</Key><UploadId>u1</UploadId>')
  expect(xml).toContain(`<Initiated>${ISO}</Initiated>`)
  expect(xml).toContain('<UploadId>u2</UploadId>')
})

it('8. serializeListParts renders a Part per entry', () => {
  const xml = serializeListParts({
    bucket: 'b',
    key: 'k',
    uploadId: 'u',
    parts: [
      { partNumber: 1, etag: '"p1"', size: 5, lastModified: MS },
      { partNumber: 2, etag: '"p2"', size: 6, lastModified: MS },
    ],
  })
  expect(xml).toContain('<ListPartsResult')
  expect(xml).toContain('<Key>k</Key>')
  expect(xml).toContain('<UploadId>u</UploadId>')
  expect(xml).toContain('<PartNumber>1</PartNumber>')
  expect(xml).toContain('<ETag>&quot;p1&quot;</ETag>')
  expect(xml).toContain('<Size>5</Size>')
  expect(xml).toContain('<PartNumber>2</PartNumber>')
})

// ===========================================================================
// Copy results
// ===========================================================================

it('9. serializeCopyObjectResult renders ETag and LastModified', () => {
  const xml = serializeCopyObjectResult({ etag: '"c"', lastModified: MS })
  expect(xml).toContain('<CopyObjectResult')
  expect(xml).toContain('<ETag>&quot;c&quot;</ETag>')
  expect(xml).toContain(`<LastModified>${ISO}</LastModified>`)
})

it('10. serializeCopyPartResult renders ETag and LastModified', () => {
  const xml = serializeCopyPartResult({ etag: '"cp"', lastModified: MS })
  expect(xml).toContain('<CopyPartResult')
  expect(xml).toContain('<ETag>&quot;cp&quot;</ETag>')
  expect(xml).toContain(`<LastModified>${ISO}</LastModified>`)
})

// ===========================================================================
// DeleteResult
// ===========================================================================

it('11. serializeDeleteResult renders Deleted and Error entries', () => {
  const xml = serializeDeleteResult({
    deleted: [{ key: 'a' }, { key: 'b' }],
    errors: [{ key: 'c', code: 'AccessDenied', message: 'nope' }],
  })
  expect(xml).toContain('<DeleteResult')
  expect(xml).toContain('<Deleted><Key>a</Key></Deleted>')
  expect(xml).toContain('<Deleted><Key>b</Key></Deleted>')
  expect(xml).toContain(
    '<Error><Key>c</Key><Code>AccessDenied</Code><Message>nope</Message></Error>',
  )
})

it('12. serializeDeleteResult in quiet mode omits Deleted entries but keeps Errors', () => {
  const xml = serializeDeleteResult({
    deleted: [{ key: 'a' }],
    errors: [{ key: 'c', code: 'X', message: 'm' }],
    quiet: true,
  })
  expect(xml).not.toContain('<Deleted>')
  expect(xml).toContain('<Error>')
})

// ===========================================================================
// LocationConstraint + Error envelope
// ===========================================================================

it('13. serializeLocationConstraint renders the region literally', () => {
  const xml = serializeLocationConstraint('us-east-1')
  expect(xml).toContain('<LocationConstraint>us-east-1</LocationConstraint>')
})

it('14. serializeError renders Code/Message/Resource/RequestId envelope', () => {
  const xml = serializeError({
    code: 'NoSuchKey',
    message: 'The specified key does not exist.',
    resource: '/b/k',
    requestId: 'req-1',
  })
  expect(xml).toContain('<?xml')
  expect(xml).toContain('<Error>')
  expect(xml).toContain('<Code>NoSuchKey</Code>')
  expect(xml).toContain('<Message>The specified key does not exist.</Message>')
  expect(xml).toContain('<Resource>/b/k</Resource>')
  expect(xml).toContain('<RequestId>req-1</RequestId>')
})

// ===========================================================================
// XML escaping
// ===========================================================================

it('15. serializers escape & < > " \' in text content', () => {
  const xml = serializeListBucketResultV2({
    name: 'b',
    maxKeys: 1000,
    keyCount: 1,
    isTruncated: false,
    contents: [{ key: `a&b<c>d"e'f`, lastModified: MS, etag: '"e"', size: 1 }],
    commonPrefixes: [],
  })
  expect(xml).toContain('<Key>a&amp;b&lt;c&gt;d&quot;e&apos;f</Key>')
})

// ===========================================================================
// parseDeleteRequest
// ===========================================================================

it('16. parseDeleteRequest extracts every Object key', () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
    <Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <Object><Key>one.txt</Key></Object>
      <Object><Key>nested/two.txt</Key></Object>
    </Delete>`
  expect(parseDeleteRequest(body).keys).toEqual(['one.txt', 'nested/two.txt'])
})

it('17. parseDeleteRequest unescapes XML entities in keys', () => {
  const body =
    '<Delete><Object><Key>a&amp;b&lt;c&gt;d&quot;e&apos;f</Key></Object></Delete>'
  expect(parseDeleteRequest(body).keys).toEqual([`a&b<c>d"e'f`])
})

it('18. parseDeleteRequest reports Quiet=true', () => {
  const body =
    '<Delete><Quiet>true</Quiet><Object><Key>k</Key></Object></Delete>'
  const parsed = parseDeleteRequest(body)
  expect(parsed.quiet).toBe(true)
  expect(parsed.keys).toEqual(['k'])
})

it('19. parseDeleteRequest defaults Quiet to false', () => {
  const body = '<Delete><Object><Key>k</Key></Object></Delete>'
  expect(parseDeleteRequest(body).quiet).toBe(false)
})

// ===========================================================================
// parseCompleteMultipartUpload
// ===========================================================================

it('20. parseCompleteMultipartUpload extracts ordered { partNumber, etag }', () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
    <CompleteMultipartUpload>
      <Part><PartNumber>1</PartNumber><ETag>"aaa"</ETag></Part>
      <Part><PartNumber>2</PartNumber><ETag>"bbb"</ETag></Part>
    </CompleteMultipartUpload>`
  expect(parseCompleteMultipartUpload(body)).toEqual([
    { partNumber: 1, etag: '"aaa"' },
    { partNumber: 2, etag: '"bbb"' },
  ])
})

it('21. parseCompleteMultipartUpload tolerates ETag before PartNumber and unescapes', () => {
  const body =
    '<CompleteMultipartUpload><Part><ETag>&quot;e1&quot;</ETag><PartNumber>1</PartNumber></Part></CompleteMultipartUpload>'
  expect(parseCompleteMultipartUpload(body)).toEqual([
    { partNumber: 1, etag: '"e1"' },
  ])
})
