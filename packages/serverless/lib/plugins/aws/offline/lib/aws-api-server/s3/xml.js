/**
 * S3 XML response serializers + request-body parsers for sls offline.
 *
 * S3's REST protocol speaks XML: list/multipart/copy/delete operations return
 * an XML document and a handful of write operations (DeleteObjects,
 * CompleteMultipartUpload) carry an XML request body. This module is the wire
 * codec for those payloads.
 *
 * The writer is hand-rolled (no XML dependency): a tiny `el()` element builder
 * over an `escapeXml()` that escapes the five XML metacharacters. The two
 * parsers are equally small — request bodies are tiny and well-formed (they are
 * produced by the AWS SDKs / CLI), so a tolerant regex scan is sufficient and
 * avoids pulling in a parser.
 *
 * Timestamps are rendered as ISO-8601 (`new Date(ms).toISOString()`), the shape
 * S3 uses for `LastModified` / `CreationDate` / `Initiated`.
 *
 * D20: `GetBucketLocation` for `us-east-1` is rendered with a literal
 * `<LocationConstraint>us-east-1</LocationConstraint>` body. Real S3 returns an
 * empty `<LocationConstraint/>` for the default region, but a literal value is
 * unambiguous offline and the AWS SDKs accept it, so we keep it explicit.
 */

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>'
const XMLNS = 'http://s3.amazonaws.com/doc/2006-03-01/'

/** STORAGE class S3 reports for every object in this emulator. */
const STORAGE_CLASS = 'STANDARD'

/**
 * Escape the five XML metacharacters for safe inclusion in element text.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Reverse {@link escapeXml} for parsed request-body text. The ampersand entity
 * is decoded last so an already-escaped `&amp;lt;` survives intact.
 *
 * @param {string} value
 * @returns {string}
 */
function unescapeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Render a single element with escaped text content.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
function el(name, value) {
  return `<${name}>${escapeXml(value)}</${name}>`
}

/**
 * Render an ISO-8601 timestamp element from epoch milliseconds.
 *
 * @param {string} name
 * @param {number} ms
 * @returns {string}
 */
function timeEl(name, ms) {
  return el(name, new Date(ms).toISOString())
}

/**
 * Wrap a body in the XML prolog and a top-level result element carrying the S3
 * namespace.
 *
 * @param {string} root - the result element name.
 * @param {string} body - the already-serialized inner XML.
 * @returns {string}
 */
function doc(root, body) {
  return `${XML_PROLOG}<${root} xmlns="${XMLNS}">${body}</${root}>`
}

/**
 * Render an object list entry (`<Contents>`), shared by v1 and v2 listings.
 *
 * @param {{ key: string, lastModified: number, etag: string, size: number }} entry
 * @returns {string}
 */
function contentsEl(entry) {
  return (
    '<Contents>' +
    el('Key', entry.key) +
    timeEl('LastModified', entry.lastModified) +
    el('ETag', entry.etag) +
    el('Size', entry.size) +
    el('StorageClass', STORAGE_CLASS) +
    '</Contents>'
  )
}

/**
 * Render a `<CommonPrefixes>` element for a rolled-up prefix.
 *
 * @param {string} prefix
 * @returns {string}
 */
function commonPrefixEl(prefix) {
  return `<CommonPrefixes>${el('Prefix', prefix)}</CommonPrefixes>`
}

/**
 * Serialize a ListAllMyBucketsResult (the GET-service response).
 *
 * @param {{ name: string, createdAt: number }[]} buckets
 * @returns {string}
 */
export function serializeListAllMyBuckets(buckets) {
  const list = buckets
    .map(
      (bucket) =>
        '<Bucket>' +
        el('Name', bucket.name) +
        timeEl('CreationDate', bucket.createdAt) +
        '</Bucket>',
    )
    .join('')
  const body =
    '<Owner><ID>offline</ID><DisplayName>offline</DisplayName></Owner>' +
    `<Buckets>${list}</Buckets>`
  return doc('ListAllMyBucketsResult', body)
}

/**
 * Serialize a ListBucketResult (V2: KeyCount + continuation tokens).
 *
 * @param {{
 *   name: string,
 *   prefix?: string,
 *   delimiter?: string,
 *   maxKeys: number,
 *   keyCount: number,
 *   isTruncated: boolean,
 *   continuationToken?: string,
 *   nextContinuationToken?: string,
 *   startAfter?: string,
 *   contents: object[],
 *   commonPrefixes: string[],
 * }} result
 * @returns {string}
 */
export function serializeListBucketResultV2(result) {
  let body =
    el('Name', result.name) +
    el('Prefix', result.prefix || '') +
    el('KeyCount', result.keyCount) +
    el('MaxKeys', result.maxKeys) +
    el('IsTruncated', result.isTruncated ? 'true' : 'false')
  if (result.delimiter !== undefined && result.delimiter !== '') {
    body += el('Delimiter', result.delimiter)
  }
  if (result.continuationToken !== undefined) {
    body += el('ContinuationToken', result.continuationToken)
  }
  if (result.startAfter !== undefined) {
    body += el('StartAfter', result.startAfter)
  }
  if (result.isTruncated && result.nextContinuationToken !== undefined) {
    body += el('NextContinuationToken', result.nextContinuationToken)
  }
  body += (result.contents || []).map(contentsEl).join('')
  body += (result.commonPrefixes || []).map(commonPrefixEl).join('')
  return doc('ListBucketResult', body)
}

/**
 * Serialize a ListBucketResult (V1: Marker / NextMarker, no KeyCount).
 *
 * @param {{
 *   name: string,
 *   prefix?: string,
 *   delimiter?: string,
 *   maxKeys: number,
 *   marker?: string,
 *   nextMarker?: string,
 *   isTruncated: boolean,
 *   contents: object[],
 *   commonPrefixes: string[],
 * }} result
 * @returns {string}
 */
export function serializeListBucketResultV1(result) {
  let body =
    el('Name', result.name) +
    el('Prefix', result.prefix || '') +
    el('Marker', result.marker || '') +
    el('MaxKeys', result.maxKeys) +
    el('IsTruncated', result.isTruncated ? 'true' : 'false')
  if (result.delimiter !== undefined && result.delimiter !== '') {
    body += el('Delimiter', result.delimiter)
  }
  if (result.isTruncated && result.nextMarker !== undefined) {
    body += el('NextMarker', result.nextMarker)
  }
  body += (result.contents || []).map(contentsEl).join('')
  body += (result.commonPrefixes || []).map(commonPrefixEl).join('')
  return doc('ListBucketResult', body)
}

/**
 * Serialize an InitiateMultipartUploadResult.
 *
 * @param {{ bucket: string, key: string, uploadId: string }} input
 * @returns {string}
 */
export function serializeInitiateMultipartUpload({ bucket, key, uploadId }) {
  return doc(
    'InitiateMultipartUploadResult',
    el('Bucket', bucket) + el('Key', key) + el('UploadId', uploadId),
  )
}

/**
 * Serialize a CompleteMultipartUploadResult.
 *
 * @param {{ location: string, bucket: string, key: string, etag: string }} input
 * @returns {string}
 */
export function serializeCompleteMultipartUpload({
  location,
  bucket,
  key,
  etag,
}) {
  return doc(
    'CompleteMultipartUploadResult',
    el('Location', location) +
      el('Bucket', bucket) +
      el('Key', key) +
      el('ETag', etag),
  )
}

/**
 * Serialize a CopyObjectResult.
 *
 * @param {{ etag: string, lastModified: number }} input
 * @returns {string}
 */
export function serializeCopyObjectResult({ etag, lastModified }) {
  return doc(
    'CopyObjectResult',
    timeEl('LastModified', lastModified) + el('ETag', etag),
  )
}

/**
 * Serialize a CopyPartResult (UploadPartCopy response body).
 *
 * @param {{ etag: string, lastModified: number }} input
 * @returns {string}
 */
export function serializeCopyPartResult({ etag, lastModified }) {
  return doc(
    'CopyPartResult',
    timeEl('LastModified', lastModified) + el('ETag', etag),
  )
}

/**
 * Serialize a ListMultipartUploadsResult.
 *
 * @param {{
 *   bucket: string,
 *   uploads: { key: string, uploadId: string, initiated: number }[],
 * }} input
 * @returns {string}
 */
export function serializeListMultipartUploads({ bucket, uploads }) {
  const list = (uploads || [])
    .map(
      (upload) =>
        '<Upload>' +
        el('Key', upload.key) +
        el('UploadId', upload.uploadId) +
        timeEl('Initiated', upload.initiated) +
        '</Upload>',
    )
    .join('')
  return doc(
    'ListMultipartUploadsResult',
    el('Bucket', bucket) + el('IsTruncated', 'false') + list,
  )
}

/**
 * Serialize a ListPartsResult.
 *
 * @param {{
 *   bucket: string,
 *   key: string,
 *   uploadId: string,
 *   parts: { partNumber: number, etag: string, size: number, lastModified: number }[],
 * }} input
 * @returns {string}
 */
export function serializeListParts({ bucket, key, uploadId, parts }) {
  const list = (parts || [])
    .map(
      (part) =>
        '<Part>' +
        el('PartNumber', part.partNumber) +
        timeEl('LastModified', part.lastModified) +
        el('ETag', part.etag) +
        el('Size', part.size) +
        '</Part>',
    )
    .join('')
  return doc(
    'ListPartsResult',
    el('Bucket', bucket) +
      el('Key', key) +
      el('UploadId', uploadId) +
      el('StorageClass', STORAGE_CLASS) +
      el('IsTruncated', 'false') +
      list,
  )
}

/**
 * Serialize a DeleteResult. In `quiet` mode only `<Error>` entries are emitted
 * (S3 suppresses the `<Deleted>` entries when the request asked for quiet).
 *
 * @param {{
 *   deleted: { key: string }[],
 *   errors?: { key: string, code: string, message: string }[],
 *   quiet?: boolean,
 * }} input
 * @returns {string}
 */
export function serializeDeleteResult({ deleted, errors, quiet }) {
  let body = ''
  if (!quiet) {
    body += (deleted || [])
      .map((entry) => `<Deleted>${el('Key', entry.key)}</Deleted>`)
      .join('')
  }
  body += (errors || [])
    .map(
      (entry) =>
        '<Error>' +
        el('Key', entry.key) +
        el('Code', entry.code) +
        el('Message', entry.message) +
        '</Error>',
    )
    .join('')
  return doc('DeleteResult', body)
}

/**
 * Serialize a GetBucketLocation response (D20: literal region value).
 *
 * @param {string} region
 * @returns {string}
 */
export function serializeLocationConstraint(region) {
  return `${XML_PROLOG}<LocationConstraint>${escapeXml(region)}</LocationConstraint>`
}

/**
 * Serialize the S3 error envelope.
 *
 * @param {{
 *   code: string,
 *   message: string,
 *   resource?: string,
 *   requestId?: string,
 * }} input
 * @returns {string}
 */
export function serializeError({ code, message, resource, requestId }) {
  return (
    XML_PROLOG +
    '<Error>' +
    el('Code', code) +
    el('Message', message) +
    el('Resource', resource || '') +
    el('RequestId', requestId || '') +
    '</Error>'
  )
}

// ---------------------------------------------------------------------------
// Request-body parsers
// ---------------------------------------------------------------------------

/**
 * Parse a `<Delete>` request body into `{ keys, quiet }`. Keys are read from
 * each `<Object><Key>…</Key></Object>`; `<Quiet>true</Quiet>` toggles quiet
 * mode. The scan is tolerant of surrounding whitespace and the XML prolog.
 *
 * @param {string} xml
 * @returns {{ keys: string[], quiet: boolean }}
 */
export function parseDeleteRequest(xml) {
  const text = String(xml || '')
  const keys = []
  const keyPattern = /<Key>([\s\S]*?)<\/Key>/g
  let match
  while ((match = keyPattern.exec(text)) !== null) {
    keys.push(unescapeXml(match[1]))
  }
  const quiet = /<Quiet>\s*true\s*<\/Quiet>/i.test(text)
  return { keys, quiet }
}

/**
 * Parse a `<CompleteMultipartUpload>` request body into an ordered list of
 * `{ partNumber, etag }`. Each `<Part>` block is matched, then its
 * `<PartNumber>` and `<ETag>` are read independently so their ordering inside
 * the block does not matter.
 *
 * @param {string} xml
 * @returns {{ partNumber: number, etag: string }[]}
 */
export function parseCompleteMultipartUpload(xml) {
  const text = String(xml || '')
  const parts = []
  const partPattern = /<Part>([\s\S]*?)<\/Part>/g
  let match
  while ((match = partPattern.exec(text)) !== null) {
    const block = match[1]
    const numberMatch = /<PartNumber>\s*(\d+)\s*<\/PartNumber>/.exec(block)
    const etagMatch = /<ETag>([\s\S]*?)<\/ETag>/.exec(block)
    if (!numberMatch || !etagMatch) continue
    parts.push({
      partNumber: Number(numberMatch[1]),
      etag: unescapeXml(etagMatch[1]),
    })
  }
  return parts
}
