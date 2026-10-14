/**
 * The plumbing shared by the HTTP endpoints Dev Mode serves to processes on this machine: each one
 * listens on loopback only, on a port the system picks, and checks a per-process token.
 */
import { timingSafeEqual } from 'crypto'

export const LOOPBACK_HOST = '127.0.0.1'

/** Listens on 127.0.0.1 on an ephemeral port; resolves `{ host, port }`, rejects when it cannot. */
export const listenLoopback = (server) =>
  new Promise((resolve, reject) => {
    const failed = (error) => reject(error)
    server.once('error', failed)
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', failed)
      resolve({ host: LOOPBACK_HOST, port: server.address().port })
    })
  })

export const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * The whole request body, as bytes. With a `limit`, a body that grows past it is not kept: `onLimit`
 * runs as soon as it does, the rest is read and dropped, and the body resolves as null.
 */
export const readBody = (req, { limit = Infinity, onLimit } = {}) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let over = false
    req.on('data', (chunk) => {
      if (over) return
      size += chunk.length
      if (size > limit) {
        over = true
        chunks.length = 0
        onLimit?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks)))
    req.on('error', reject)
  })

/**
 * Whether `given` is the expected token, compared in constant time. Anything that is not a
 * non-empty string, or differs in length, is refused rather than thrown on.
 */
export const sameToken = (given, expected) => {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}
