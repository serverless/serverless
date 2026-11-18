import { expect, test } from '@jest/globals'
import { createHash } from 'node:crypto'
import {
  LOCAL_CREDENTIALS_REFRESH_MS,
  LOCAL_CREDENTIALS_RETRY_MAX_MS,
  LOCAL_CREDENTIALS_RETRY_MS,
  createLocalOnlyCredentials,
  requestLocalCredentials,
} from '../../../../../../../lib/plugins/aws/dev/web/local-credentials.js'
import { CREDENTIALS_PATH } from '../../../../../../../lib/plugins/aws/dev/web/relay.js'
import { countingTimers } from '../attach/fakes.js'

const DEVELOPER = {
  accessKeyId: 'AKIDDEVELOPER',
  secretAccessKey: 'developer-secret-never-logged',
  sessionToken: 'developer-token',
}

const manualTimers = () => {
  const pending = new Map()
  let next = 0
  return {
    pending,
    setTimeout: (fn, ms) => {
      next += 1
      pending.set(next, { fn, ms })
      return next
    },
    clearTimeout: (id) => pending.delete(id),
    fire() {
      const [[id, { fn, ms }]] = [...pending]
      pending.delete(id)
      fn()
      return ms
    },
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('the credentials request is a GET of the credentials path, header-signed for lambda with the developer credentials', async () => {
  const sent = []
  const answer = await requestLocalCredentials({
    url: 'https://sls-dev-local-api.web.test',
    region: 'us-east-1',
    credentials: async () => DEVELOPER,
    fetch: async (url, init) => {
      sent.push({ url, init })
      return { status: 204 }
    },
    now: () => Date.UTC(2026, 9, 27, 12),
  })
  expect(answer).toEqual({ status: 204 })
  expect(sent).toHaveLength(1)
  const [{ url, init }] = sent
  expect(url).toBe(`https://sls-dev-local-api.web.test${CREDENTIALS_PATH}`)
  expect(init.method).toBe('GET')
  expect(init.headers.authorization).toMatch(
    /^AWS4-HMAC-SHA256 Credential=AKIDDEVELOPER\/20261027\/us-east-1\/lambda\/aws4_request, SignedHeaders=.*host.*x-amz-content-sha256/,
  )
  expect(init.headers['x-amz-content-sha256']).toBe(
    createHash('sha256').update('').digest('hex'),
  )
  expect(init.headers['x-amz-security-token']).toBe('developer-token')
  expect(init.headers.host).toBeUndefined()
})

test('each --local-only web app gets its credentials at start and every 30 min; a failure retries sooner; a denial stops and says so', async () => {
  const timers = manualTimers()
  const answers = { api: [204, 204], admin: [503, 204], blog: [403] }
  const calls = []
  const states = []
  const credentials = createLocalOnlyCredentials({
    webApps: [
      { key: 'api', url: 'https://api.web.test' },
      { key: 'admin', url: 'https://admin.web.test' },
      { key: 'blog', url: 'https://blog.web.test' },
    ],
    region: 'us-east-1',
    credentials: async () => DEVELOPER,
    fetch: async (url) => {
      const key = new URL(url).hostname.split('.')[0]
      calls.push(key)
      return { status: answers[key].shift() }
    },
    timers,
    logger: { debug() {} },
    onState: (key, state) => states.push([key, state]),
  })
  credentials.start()
  await settle()
  expect(calls.sort()).toEqual(['admin', 'api', 'blog'])
  expect(credentials.stateOf('api')).toBe('ready')
  expect(credentials.stateOf('admin')).toBe('failed')
  expect(credentials.stateOf('blog')).toBe('denied')
  expect(states).toEqual(
    expect.arrayContaining([
      ['api', 'ready'],
      ['blog', 'denied'],
    ]),
  )
  // A refresh for api, a retry for admin; nothing more for blog.
  expect([...timers.pending.values()].map(({ ms }) => ms).sort()).toEqual(
    [LOCAL_CREDENTIALS_RETRY_MS, LOCAL_CREDENTIALS_REFRESH_MS].sort(),
  )
  expect(LOCAL_CREDENTIALS_REFRESH_MS).toBe(30 * 60_000)
  credentials.stop()
  expect(timers.pending.size).toBe(0)
})

test('a request that throws (no network, no credentials) counts as a failure; stop leaves no timer', async () => {
  const timers = countingTimers()
  const credentials = createLocalOnlyCredentials({
    webApps: [{ key: 'api', url: 'https://api.web.test' }],
    region: 'us-east-1',
    credentials: async () => {
      throw new Error('Token is expired')
    },
    fetch: async () => ({ status: 204 }),
    timers,
    logger: { debug() {} },
  })
  credentials.start()
  await settle()
  expect(credentials.stateOf('api')).toBe('failed')
  expect(timers.live()).toBe(1)
  credentials.stop()
  expect(timers.live()).toBe(0)
})

test('a 403 for an expired token or a bad signature is retried, waiting longer each time up to 5 min; AccessDenied is not', async () => {
  const timers = manualTimers()
  const headersOf = (errorType) => ({
    get: (name) => (name === 'x-amzn-errortype' ? errorType : null),
  })
  const answers = {
    api: [
      {
        status: 403,
        headers: headersOf('ExpiredTokenException:token expired'),
      },
      { status: 403, headers: headersOf('InvalidSignatureException') },
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 204 },
    ],
    blog: [{ status: 403, headers: headersOf('AccessDeniedException') }],
  }
  const credentials = createLocalOnlyCredentials({
    webApps: [
      { key: 'api', url: 'https://api.web.test' },
      { key: 'blog', url: 'https://blog.web.test' },
    ],
    region: 'us-east-1',
    credentials: async () => DEVELOPER,
    fetch: async (url) => answers[new URL(url).hostname.split('.')[0]].shift(),
    timers,
    logger: { debug() {} },
  })
  credentials.start()
  await settle()
  expect(credentials.stateOf('blog')).toBe('denied')
  const waits = []
  while (credentials.stateOf('api') !== 'ready') {
    expect(credentials.stateOf('api')).toBe('failed')
    waits.push(timers.fire())
    await settle()
  }
  expect(waits).toEqual([
    LOCAL_CREDENTIALS_RETRY_MS,
    LOCAL_CREDENTIALS_RETRY_MS * 2,
    LOCAL_CREDENTIALS_RETRY_MS * 4,
    LOCAL_CREDENTIALS_RETRY_MS * 8,
    LOCAL_CREDENTIALS_RETRY_MS * 16,
    LOCAL_CREDENTIALS_RETRY_MAX_MS,
    LOCAL_CREDENTIALS_RETRY_MAX_MS,
  ])
  // Once answered, the next request is the refresh.
  expect([...timers.pending.values()].map(({ ms }) => ms)).toEqual([
    LOCAL_CREDENTIALS_REFRESH_MS,
  ])
  credentials.stop()
})
