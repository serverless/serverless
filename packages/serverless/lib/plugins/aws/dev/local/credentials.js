/**
 * The deployed function's role credentials, served on loopback the way container credentials are
 * (AWS_CONTAINER_CREDENTIALS_FULL_URI + AWS_CONTAINER_AUTHORIZATION_TOKEN). Every AWS SDK reads this
 * endpoint and refreshes from it on its own, so a long-lived handler process always gets the newest
 * credentials the function's execution environment forwarded, and none of them sit in the handler
 * process's environment. One path and one token per handler process.
 */
import http from 'http'
import { randomBytes as nodeRandomBytes } from 'crypto'
import { listenLoopback, sameToken, sendJson } from './loopback.js'

/** How long served credentials are declared valid; SDKs come back for fresh ones well before. */
export const CREDENTIALS_TTL_MS = 15 * 60_000

const ROUTE = /^\/credentials\/([A-Za-z0-9_-]{1,64})$/

export const createCredentialsServer = ({
  randomBytes = nodeRandomBytes,
  now = Date.now,
} = {}) => {
  const entries = new Map()
  let base = null
  const server = http.createServer((req, res) => {
    const match = ROUTE.exec(String(req.url ?? '').split('?')[0])
    const entry = match && entries.get(match[1])
    if (req.method !== 'GET' || !entry) {
      return sendJson(res, 404, { message: 'Not found' })
    }
    if (!sameToken(req.headers.authorization, entry.token)) {
      return sendJson(res, 401, { message: 'Unauthorized' })
    }
    if (!entry.credentials) {
      return sendJson(res, 503, {
        message: 'No credentials from the deployed function yet',
      })
    }
    return sendJson(res, 200, {
      AccessKeyId: entry.credentials.accessKeyId,
      SecretAccessKey: entry.credentials.secretAccessKey,
      Token: entry.credentials.sessionToken,
      Expiration: new Date(now() + CREDENTIALS_TTL_MS).toISOString(),
    })
  })

  return {
    async listen() {
      const { host, port } = await listenLoopback(server)
      base = `http://${host}:${port}`
      return base
    },
    register(id) {
      const entry = {
        token: randomBytes(32).toString('hex'),
        credentials: null,
      }
      entries.set(id, entry)
      return {
        uri: `${base}/credentials/${id}`,
        token: entry.token,
        update(credentials) {
          if (credentials) entry.credentials = credentials
        },
      }
    },
    unregister(id) {
      entries.delete(id)
    },
    async close() {
      entries.clear()
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
