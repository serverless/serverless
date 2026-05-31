import Hapi from '@hapi/hapi'
import { createS3Handlers } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/handlers.js'
import { createBucketStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/s3/bucket-store.js'

// ---------------------------------------------------------------------------
// Test harness
//
// We exercise the handler through a real Hapi server's `inject`, mounting the
// same catch-all route shape the API server uses (`payload: { parse: false }`
// → `request.payload` is a raw Buffer, `request.path` carries the leading
// slash). This is the faithful way to verify binary-body passthrough and the
// leading-slash path the parser expects.
// ---------------------------------------------------------------------------

/**
 * Build a started Hapi server whose catch-all route delegates to the S3
 * handler created over a fresh bucket store. Buckets are pre-provisioned (S3
 * buckets are created up front by the wiring layer, not on first write).
 *
 * @param {string[]} [buckets] - bucket names to create on the fresh store.
 * @returns {Promise<{ server: import('@hapi/hapi').Server, store: object }>}
 */
async function makeServer(buckets = ['my-bucket', 'b']) {
  const store = createBucketStore()
  for (const name of buckets) store.createBucket(name)
  const handler = createS3Handlers({ store })
  const server = Hapi.server({
    host: 'localhost',
    port: 0,
    router: { stripTrailingSlash: true },
  })
  server.route({
    method: '*',
    path: '/{any*}',
    options: { payload: { parse: false, maxBytes: 10 * 1024 * 1024 } },
    handler,
  })
  await server.start()
  return { server, store }
}

/**
 * Render a SigV4 presigned query string with an explicit expiry window.
 *
 * @param {{ date: string, expires: string }} input
 * @returns {string}
 */
function presignedQuery({ date, expires }) {
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential':
      'AKIAIOSFODNN7EXAMPLE/20260531/us-east-1/s3/aws4_request',
    'X-Amz-Date': date,
    'X-Amz-Expires': expires,
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Signature': 'abc123def456',
  })
  return params.toString()
}

let active

afterEach(async () => {
  if (active) {
    await active.stop({ timeout: 1000 })
    active = undefined
  }
})

// ---------------------------------------------------------------------------
// 1. PutObject → GetObject round-trip preserves the exact bytes (binary)
// ---------------------------------------------------------------------------

it('1. round-trips object bytes through PUT then GET (binary preserved)', async () => {
  const { server } = await makeServer()
  active = server

  // A binary payload spanning the full byte range, including a NUL and 0xFF.
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff, 0x42, 0x00, 0x7f])

  const put = await server.inject({
    method: 'PUT',
    url: '/my-bucket/blob.bin',
    headers: { 'content-type': 'application/octet-stream' },
    payload: bytes,
  })
  expect(put.statusCode).toBe(200)
  expect(put.headers.etag).toBeDefined()

  const get = await server.inject({ method: 'GET', url: '/my-bucket/blob.bin' })
  expect(get.statusCode).toBe(200)
  expect(get.headers['content-type']).toBe('application/octet-stream')
  // rawPayload is the unmodified response Buffer — the bytes must match exactly.
  expect(Buffer.compare(get.rawPayload, bytes)).toBe(0)
  expect(Number(get.headers['content-length'])).toBe(bytes.length)
})

// ---------------------------------------------------------------------------
// 2. GetObject with a Range → 206 + Content-Range
// ---------------------------------------------------------------------------

it('2. serves a Range request with 206 and Content-Range', async () => {
  const { server } = await makeServer()
  active = server

  const bytes = Buffer.from('0123456789')
  await server.inject({ method: 'PUT', url: '/b/r.txt', payload: bytes })

  const res = await server.inject({
    method: 'GET',
    url: '/b/r.txt',
    headers: { range: 'bytes=2-5' },
  })
  expect(res.statusCode).toBe(206)
  expect(res.headers['content-range']).toBe('bytes 2-5/10')
  expect(res.rawPayload.toString()).toBe('2345')
})

// ---------------------------------------------------------------------------
// 3. HeadObject → 200 with headers and an empty body
// ---------------------------------------------------------------------------

it('3. answers HEAD with headers and an empty body', async () => {
  const { server } = await makeServer()
  active = server

  const bytes = Buffer.from('hello head')
  await server.inject({
    method: 'PUT',
    url: '/b/h.txt',
    headers: { 'content-type': 'text/plain' },
    payload: bytes,
  })

  const res = await server.inject({ method: 'HEAD', url: '/b/h.txt' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/plain')
  expect(Number(res.headers['content-length'])).toBe(bytes.length)
  expect(res.headers.etag).toBeDefined()
  expect(res.rawPayload.length).toBe(0)
})

// ---------------------------------------------------------------------------
// 4. DeleteObject → 204
// ---------------------------------------------------------------------------

it('4. deletes an object with 204', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/d.txt', payload: 'x' })
  const res = await server.inject({ method: 'DELETE', url: '/b/d.txt' })
  expect(res.statusCode).toBe(204)
  expect(res.rawPayload.length).toBe(0)
})

// ---------------------------------------------------------------------------
// 5. ListObjectsV2 → XML body with the stored key
// ---------------------------------------------------------------------------

it('5. lists objects (V2) as application/xml', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/one.txt', payload: 'a' })
  await server.inject({ method: 'PUT', url: '/b/two.txt', payload: 'bb' })

  const res = await server.inject({
    method: 'GET',
    url: '/b?list-type=2',
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toMatch(/application\/xml/)
  expect(res.payload).toContain('<ListBucketResult')
  expect(res.payload).toContain('<Key>one.txt</Key>')
  expect(res.payload).toContain('<Key>two.txt</Key>')
  expect(res.payload).toContain('<KeyCount>2</KeyCount>')
})

// ---------------------------------------------------------------------------
// 6. DeleteObjects (POST ?delete) with an XML body
// ---------------------------------------------------------------------------

it('6. deletes multiple objects from an XML <Delete> body', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/k1', payload: 'a' })
  await server.inject({ method: 'PUT', url: '/b/k2', payload: 'b' })

  const body =
    '<Delete><Object><Key>k1</Key></Object><Object><Key>k2</Key></Object></Delete>'
  const res = await server.inject({
    method: 'POST',
    url: '/b?delete',
    headers: { 'content-type': 'application/xml' },
    payload: body,
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toMatch(/application\/xml/)
  expect(res.payload).toContain('<Deleted><Key>k1</Key></Deleted>')
  expect(res.payload).toContain('<Deleted><Key>k2</Key></Deleted>')
})

// ---------------------------------------------------------------------------
// 7. NoSuchKey → 404 XML error envelope
// ---------------------------------------------------------------------------

it('7. returns a 404 XML error for a missing key', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/exists', payload: 'x' })
  const res = await server.inject({ method: 'GET', url: '/b/missing' })
  expect(res.statusCode).toBe(404)
  expect(res.headers['content-type']).toMatch(/application\/xml/)
  expect(res.payload).toContain('<Code>NoSuchKey</Code>')
})

// ---------------------------------------------------------------------------
// 8. An expired presigned GET → 403 AccessDenied / Request has expired
// ---------------------------------------------------------------------------

it('8. rejects an expired presigned GET with 403', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/secret', payload: 'x' })

  // Signed at 2020, 900s window → long expired against the real clock.
  const query = presignedQuery({ date: '20200101T000000Z', expires: '900' })
  const res = await server.inject({ method: 'GET', url: `/b/secret?${query}` })
  expect(res.statusCode).toBe(403)
  expect(res.headers['content-type']).toMatch(/application\/xml/)
  expect(res.payload).toContain('<Code>AccessDenied</Code>')
  expect(res.payload).toContain('Request has expired')
})

// ---------------------------------------------------------------------------
// 9. A valid (unexpired) presigned GET is served normally
// ---------------------------------------------------------------------------

it('9. serves a valid presigned GET normally', async () => {
  const { server } = await makeServer()
  active = server

  await server.inject({ method: 'PUT', url: '/b/ok.txt', payload: 'visible' })

  // Signed far in the future so the window is open regardless of the clock.
  const query = presignedQuery({ date: '20300101T000000Z', expires: '900' })
  const res = await server.inject({ method: 'GET', url: `/b/ok.txt?${query}` })
  expect(res.statusCode).toBe(200)
  expect(res.rawPayload.toString()).toBe('visible')
})

// ---------------------------------------------------------------------------
// 10. An unexpected (non-S3OpError) failure becomes a 500 InternalError XML
// ---------------------------------------------------------------------------

it('10. maps an unexpected failure to a 500 InternalError XML', async () => {
  const store = createBucketStore()
  // Force an unexpected (non-tagged) throw from deep in the op path.
  store.listObjectsV2 = () => {
    throw new Error('boom')
  }
  const handler = createS3Handlers({ store })
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.route({
    method: '*',
    path: '/{any*}',
    options: { payload: { parse: false } },
    handler,
  })
  await server.start()
  active = server

  const res = await server.inject({ method: 'GET', url: '/b?list-type=2' })
  expect(res.statusCode).toBe(500)
  expect(res.headers['content-type']).toMatch(/application\/xml/)
  expect(res.payload).toContain('<Code>InternalError</Code>')
})
