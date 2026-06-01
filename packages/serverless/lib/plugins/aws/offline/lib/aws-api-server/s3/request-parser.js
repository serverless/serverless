/**
 * S3 REST request parser for sls offline.
 *
 * Turns a normalised HTTP request descriptor — `{ method, path, query, headers }`
 * — into `{ operation, bucket, key, params }`, the shape `ops.runOp` consumes.
 *
 * Both S3 addressing styles are supported:
 *  - **Path-style** (`/<bucket>/<key>`): the first path segment is the bucket
 *    (possibly empty for the service root) and the remainder is the key.
 *  - **Virtual-hosted-style** (`<bucket>.<endpoint-host>/<key>`): the AWS SDK's
 *    default when `forcePathStyle` is not set. The bucket arrives as a leading
 *    label on the `Host` header and the whole path is the key. The bucket is
 *    read from the host when it sits over one of the recognised endpoint hosts
 *    (`hosts`, default `['localhost']`); otherwise the request is path-style.
 *
 * The operation is then chosen from the HTTP method, the presence of a key, and
 * the S3 query markers / headers that distinguish otherwise identical verb+path
 * pairs (e.g. `?list-type=2`, `?uploads`, `?uploadId`, `?partNumber`,
 * `?delete`, `?location`, and the `x-amz-copy-source` / `range` headers).
 *
 * `params` carries only the bits each operation needs, already coerced (numeric
 * `maxKeys`/`partNumber`, parsed copy source, folded `x-amz-meta-*` metadata).
 */

/** Endpoint hosts recognised as a virtual-hosted-style bucket suffix. */
const DEFAULT_HOSTS = ['localhost']

/**
 * Read a header case-insensitively. HTTP header names are case-insensitive and
 * different clients/servers normalise them differently, so never assume a case.
 *
 * @param {Record<string, string>} headers
 * @param {string} name - lower-case header name to look up.
 * @returns {string | undefined}
 */
function header(headers, name) {
  if (!headers) return undefined
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

/**
 * Whether a query marker is present. S3 markers are valueless flags
 * (`?uploads`, `?delete`, `?location`) but clients sometimes send `=''`; treat
 * any present key — even with an empty value — as set.
 *
 * @param {Record<string, string>} query
 * @param {string} name
 * @returns {boolean}
 */
function has(query, name) {
  return query != null && Object.prototype.hasOwnProperty.call(query, name)
}

/**
 * Coerce a query value to an integer, or undefined when absent / not numeric.
 *
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
function toInt(value) {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Decode a URL-encoded path/key segment, tolerating a malformed `%` sequence by
 * falling back to the raw value rather than throwing.
 *
 * @param {string} value
 * @returns {string}
 */
function decode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Split a path-style path into `{ bucket, key }`. The leading slash is dropped,
 * the first segment is the bucket, and the remainder (with embedded slashes
 * preserved) is the URL-decoded key.
 *
 * @param {string} path
 * @returns {{ bucket: string, key: string }}
 */
function splitPath(path) {
  const trimmed = String(path || '').replace(/^\/+/, '')
  const slash = trimmed.indexOf('/')
  if (slash === -1) {
    return { bucket: decode(trimmed), key: '' }
  }
  return {
    bucket: decode(trimmed.slice(0, slash)),
    key: decode(trimmed.slice(slash + 1)),
  }
}

/**
 * Resolve the bucket from a virtual-hosted-style `Host` header, if present.
 *
 * In virtual-hosted-style addressing the SDK puts the bucket in the host as a
 * leading label over the endpoint host (`<bucket>.localhost:3002`) and sends
 * only the key in the path. The bucket is the portion before a recognised
 * endpoint-host suffix; the port and case are ignored when matching. Returns
 * `undefined` for path-style requests (a bare endpoint host, an IP, or any host
 * not in `hosts`), leaving the caller to fall back to `splitPath`.
 *
 * @param {Record<string, string>} headers
 * @param {string[]} hosts - recognised endpoint host names (no port).
 * @returns {string | undefined} the bucket label, or undefined for path-style.
 */
function bucketFromHost(headers, hosts) {
  const raw = header(headers, 'host')
  if (!raw) return undefined
  const hostname = raw.replace(/:\d+$/, '')
  const lower = hostname.toLowerCase()
  for (const base of hosts) {
    const suffix = `.${String(base).toLowerCase()}`
    // A leading bucket label must precede the suffix (length strictly greater),
    // so a bare endpoint host (`localhost`) stays path-style.
    if (lower.endsWith(suffix) && lower.length > suffix.length) {
      return hostname.slice(0, hostname.length - suffix.length)
    }
  }
  return undefined
}

/**
 * Parse an `x-amz-copy-source` header (`/<bucket>/<key>` or `<bucket>/<key>`,
 * URL-encoded) into `{ bucket, key }`. The leading slash is optional.
 *
 * @param {string} value
 * @returns {{ bucket: string, key: string }}
 */
function parseCopySource(value) {
  const trimmed = String(value).replace(/^\/+/, '')
  const slash = trimmed.indexOf('/')
  if (slash === -1) {
    return { bucket: decode(trimmed), key: '' }
  }
  return {
    bucket: decode(trimmed.slice(0, slash)),
    key: decode(trimmed.slice(slash + 1)),
  }
}

/**
 * Fold `x-amz-meta-*` request headers into a lower-cased metadata map. S3
 * lower-cases user-metadata header names, so we normalise here to keep the
 * store + GET/HEAD echo consistent.
 *
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function collectMetadata(headers) {
  const metadata = {}
  if (!headers) return metadata
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('x-amz-meta-')) metadata[lower] = value
  }
  return metadata
}

/**
 * Build the list params shared by ListObjects (v1) and ListObjectsV2.
 *
 * @param {Record<string, string>} query
 * @returns {object}
 */
function listParams(query) {
  const params = {}
  if (query.prefix !== undefined) params.prefix = query.prefix
  if (query.delimiter !== undefined) params.delimiter = query.delimiter
  const maxKeys = toInt(query['max-keys'])
  if (maxKeys !== undefined) params.maxKeys = maxKeys
  // The AWS JS SDK sends `encoding-type=url` by default and URL-decodes the
  // returned keys, so the response must URL-encode them when it is set.
  if (query['encoding-type'] !== undefined) {
    params.encodingType = query['encoding-type']
  }
  return params
}

/**
 * Parse a normalised S3 request into `{ operation, bucket, key, params }`.
 *
 * @param {{
 *   method: string,
 *   path: string,
 *   query?: Record<string, string>,
 *   headers?: Record<string, string>,
 *   hosts?: string[],
 * }} request - `hosts` lists the endpoint host names recognised as a
 *   virtual-hosted-style bucket suffix (defaults to `['localhost']`).
 * @returns {{ operation: string, bucket: string, key: string, params: object }}
 */
export function parseS3Request({
  method,
  path,
  query = {},
  headers = {},
  hosts = DEFAULT_HOSTS,
}) {
  const verb = String(method || '').toUpperCase()
  // Virtual-hosted-style requests carry the bucket on the Host header and the
  // whole path as the key; path-style requests split the bucket off the path.
  const hostBucket = bucketFromHost(headers, hosts)
  const { bucket, key } =
    hostBucket !== undefined
      ? {
          bucket: hostBucket,
          key: decode(String(path || '').replace(/^\/+/, '')),
        }
      : splitPath(path)

  const copySourceHeader = header(headers, 'x-amz-copy-source')
  const copySource = copySourceHeader
    ? parseCopySource(copySourceHeader)
    : undefined
  const hasUploadId = has(query, 'uploadId')
  const hasPartNumber = has(query, 'partNumber')

  let operation
  const params = {}

  if (verb === 'GET') {
    if (!bucket) {
      operation = 'ListBuckets'
    } else if (!key) {
      if (has(query, 'location')) {
        operation = 'GetBucketLocation'
      } else if (has(query, 'uploads')) {
        operation = 'ListMultipartUploads'
      } else if (query['list-type'] === '2') {
        operation = 'ListObjectsV2'
        Object.assign(params, listParams(query))
        if (query['continuation-token'] !== undefined) {
          params.continuationToken = query['continuation-token']
        }
        if (query['start-after'] !== undefined) {
          params.startAfter = query['start-after']
        }
      } else {
        operation = 'ListObjects'
        Object.assign(params, listParams(query))
        if (query.marker !== undefined) params.marker = query.marker
      }
    } else if (hasUploadId) {
      operation = 'ListParts'
      params.uploadId = query.uploadId
    } else {
      operation = 'GetObject'
      const range = header(headers, 'range')
      if (range !== undefined) params.range = range
    }
  } else if (verb === 'PUT') {
    if (!key) {
      operation = 'CreateBucket'
    } else if (copySource) {
      params.copySource = copySource
      if (hasPartNumber && hasUploadId) {
        operation = 'UploadPartCopy'
        params.partNumber = toInt(query.partNumber)
        params.uploadId = query.uploadId
        const copyRange = header(headers, 'x-amz-copy-source-range')
        if (copyRange !== undefined) params.copySourceRange = copyRange
      } else {
        operation = 'CopyObject'
        const directive = header(headers, 'x-amz-metadata-directive')
        if (directive !== undefined) params.metadataDirective = directive
        const contentType = header(headers, 'content-type')
        if (contentType !== undefined) params.contentType = contentType
        params.metadata = collectMetadata(headers)
      }
    } else if (hasPartNumber && hasUploadId) {
      operation = 'UploadPart'
      params.partNumber = toInt(query.partNumber)
      params.uploadId = query.uploadId
    } else {
      operation = 'PutObject'
      const contentType = header(headers, 'content-type')
      if (contentType !== undefined) params.contentType = contentType
      params.metadata = collectMetadata(headers)
    }
  } else if (verb === 'POST') {
    if (key && has(query, 'uploads')) {
      operation = 'CreateMultipartUpload'
      const contentType = header(headers, 'content-type')
      if (contentType !== undefined) params.contentType = contentType
      params.metadata = collectMetadata(headers)
    } else if (key && hasUploadId) {
      operation = 'CompleteMultipartUpload'
      params.uploadId = query.uploadId
    } else if (has(query, 'delete')) {
      operation = 'DeleteObjects'
    } else {
      operation = 'UnknownPostOperation'
    }
  } else if (verb === 'DELETE') {
    if (!key) {
      operation = 'DeleteBucket'
    } else if (hasUploadId) {
      operation = 'AbortMultipartUpload'
      params.uploadId = query.uploadId
    } else {
      operation = 'DeleteObject'
    }
  } else if (verb === 'HEAD') {
    operation = key ? 'HeadObject' : 'HeadBucket'
  } else {
    operation = 'UnknownOperation'
  }

  return { operation, bucket, key, params }
}
