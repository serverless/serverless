/**
 * A test-only way to hand a running `serverless dev` an invocation the way the relay
 * from Lambda does: the Framework's own live tests capture a deployed function's environment and
 * post a live-shaped invocation here. Active only when SLS_DEV_TEST_FEED=1. Loopback only, behind
 * a random token; the address and the token are written to .serverless/dev/test-feed.json
 * (owner read/write only), and the file is removed when the session ends.
 *
 * POST /invoke, `Authorization: <token>`, JSON
 * `{ function, environmentId, headers, event | eventBase64, environment }` → 200 with the reply
 * summarized by `summarizeReply`; 401 for a wrong token, 400 for a body that is not JSON, 404 for
 * anything else.
 */
import fs from 'fs'
import http from 'http'
import path from 'path'
import { randomBytes as nodeRandomBytes } from 'crypto'
import { listenLoopback, readBody, sameToken, sendJson } from './loopback.js'
import { ensureRealDir, writeNewFile } from '../state/real-dir.js'

export const TEST_FEED_FILE = 'test-feed.json'
export const testFeedEnabled = (env = process.env) =>
  env.SLS_DEV_TEST_FEED === '1'

/** A reply as plain JSON: bodies in base64, and for a stream when each chunk arrived. */
export const summarizeReply = async (reply, startedAt, now = Date.now) => {
  if (reply.kind !== 'stream') {
    return {
      kind: reply.kind,
      errorType: reply.errorType ?? null,
      contentType: reply.contentType ?? null,
      bodyBase64: reply.body
        ? Buffer.from(reply.body).toString('base64')
        : null,
    }
  }
  const chunks = []
  const parts = []
  for await (const chunk of reply.body) {
    chunks.push({ atMs: now() - startedAt, bytes: chunk.length })
    parts.push(chunk)
  }
  const trailers = await reply.ended
  return {
    kind: 'stream',
    errorType: trailers?.errorType ?? null,
    contentType: reply.contentType ?? null,
    bodyBase64: Buffer.concat(parts).toString('base64'),
    chunks,
    firstByteMs: chunks[0]?.atMs ?? null,
    trailers,
  }
}

const eventOf = (request) =>
  request.eventBase64 !== undefined
    ? Buffer.from(String(request.eventBase64), 'base64')
    : Buffer.from(JSON.stringify(request.event ?? {}))

export const startTestFeed = async ({
  runtime,
  dir,
  now = Date.now,
  randomBytes = nodeRandomBytes,
  pid = process.pid,
}) => {
  const token = randomBytes(32).toString('hex')
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/invoke') {
        return sendJson(res, 404, { message: 'Not found' })
      }
      if (!sameToken(req.headers.authorization, token)) {
        return sendJson(res, 401, { message: 'Unauthorized' })
      }
      let request
      try {
        request = JSON.parse((await readBody(req)).toString('utf8'))
      } catch {
        return sendJson(res, 400, { message: 'The body must be JSON' })
      }
      if (!request || typeof request !== 'object') {
        return sendJson(res, 400, { message: 'The body must be a JSON object' })
      }
      const startedAt = now()
      const reply = await runtime.invoke({
        functionKey: request.function,
        environmentId: request.environmentId,
        headers: request.headers ?? {},
        event: eventOf(request),
        environment: request.environment,
      })
      return sendJson(res, 200, await summarizeReply(reply, startedAt, now))
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { message: String(error?.message ?? error) })
      }
    }
  })
  // An invocation can run for as long as the function's timeout.
  server.requestTimeout = 0
  const { host, port } = await listenLoopback(server)
  const file = path.join(dir, TEST_FEED_FILE)
  try {
    ensureRealDir({ dir, fs })
    // A file left by a session that was killed keeps its mode; start from a new one.
    fs.rmSync(file, { force: true })
    writeNewFile(
      fs,
      file,
      JSON.stringify({ url: `http://${host}:${port}/invoke`, token, pid }),
    )
  } catch (error) {
    server.close()
    throw error
  }
  let stopping
  return {
    file,
    stop() {
      stopping ??= (async () => {
        fs.rmSync(file, { force: true })
        server.closeAllConnections?.()
        await new Promise((resolve) => server.close(() => resolve()))
      })()
      return stopping
    },
  }
}
