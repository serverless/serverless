// Suppress maintenance mode message
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = 1

// Import AWS SDK
import AWS from 'aws-sdk'

// Import the metadata_service from AWS SDK
import metadataService from 'aws-sdk/lib/metadata_service.js'

// Patch the Metadata Service
const { prototype: metadataServicePrototype } = metadataService
const originalRequest = metadataServicePrototype.request

metadataServicePrototype.request = function (path, options, callback) {
  this.maxRetries = 0 // Set maximum retries to 0
  if (!this.httpOptions.connectTimeout) {
    this.httpOptions.connectTimeout = 1000 // Set default connection timeout
  }
  return originalRequest.call(this, path, options, callback)
}

/**
 * Make read() without a size return everything buffered, as it did before
 * Node.js 26 (nodejs/node#60441), which returns only the first buffered chunk.
 * The SDK reads a response once per 'readable' event, so with a single chunk
 * per read, the chunks that arrive together with the end of the response are
 * never read, 'end' never fires and the request never settles. Reads with a
 * size, reads in flowing mode (piped streams) and object-mode streams are left
 * unchanged.
 */
export const drainBufferedOnRead = (stream) => {
  const read = stream.read
  stream.read = function (size) {
    if (size != null || this.readableFlowing || this.readableObjectMode) {
      return read.call(this, size)
    }
    const first = read.call(this)
    if (first === null) return null
    const chunks = [first]
    let chunk
    while ((chunk = read.call(this)) !== null) chunks.push(chunk)
    if (chunks.length === 1) return first
    return typeof first === 'string' ? chunks.join('') : Buffer.concat(chunks)
  }
}

// Patch the HTTP client so every response the SDK reads drains on read()
const { prototype: nodeHttpClientPrototype } = AWS.NodeHttpClient
const originalHandleRequest = nodeHttpClientPrototype.handleRequest

nodeHttpClientPrototype.handleRequest = function (
  httpRequest,
  httpOptions,
  callback,
  errCallback,
) {
  return originalHandleRequest.call(
    this,
    httpRequest,
    httpOptions,
    (httpResp) => {
      drainBufferedOnRead(httpResp)
      return callback(httpResp)
    },
    errCallback,
  )
}

// Export the modified AWS SDK as default
export default AWS
