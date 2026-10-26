import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest } from '@jest/globals'

// A stand-in for the login broker's WebSocket: the test drives its events.
class FakeSocket {
  static opened
  static #resolveOpened
  static reset() {
    FakeSocket.opened = new Promise((resolve) => {
      FakeSocket.#resolveOpened = resolve
    })
  }
  constructor(url, protocols, options) {
    this.url = url
    this.options = options
    this.sent = []
    this.closed = false
    FakeSocket.#resolveOpened(this)
  }
  send(data) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
}
jest.unstable_mockModule('ws', () => ({ default: FakeSocket }))

const { Authentication } = await import('../../../../src/lib/auth/index.js')

// loginViaBrowser opens the socket only after its awaits settle, which include reading the CA
// files, so a fixed number of event-loop turns isn't enough: wait for the socket itself.
const openedSocket = () => FakeSocket.opened

const ready = (socket, extra) =>
  socket.onmessage({
    data: JSON.stringify({ event: 'ready', transactionId: 'tx-1', ...extra }),
  })

// A token-looking id token: the sign-in only decodes it for display fields.
const idToken = `x.${Buffer.from(
  JSON.stringify({ sub: 'u1', name: 'Tester', email: 't@example.test' }),
).toString('base64url')}.y`

const fulfilled = (socket, extra) =>
  socket.onmessage({
    data: JSON.stringify({
      event: 'fulfilled',
      id_token: idToken,
      refresh_token: 'r',
      access_token: 'a',
      username: 'tester',
      user_uid: 'u1',
      ...extra,
    }),
  })

// The login broker issues a user code with the sign-in URL (its `ready`
// event). The CLI prints it, the Dashboard asks the person to type it, and
// the broker relays the tokens only when it matches. A URL that reaches
// someone who did not run the command (phishing) asks for a code they do not
// have. The code never travels in the URL, and the CLI never chooses it.
describe('loginViaBrowser user code', () => {
  beforeEach(() => {
    FakeSocket.reset()
  })

  it('asks the broker for a login and returns the code it issues', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    socket.onopen()
    expect(socket.sent.map((data) => JSON.parse(data))).toEqual([
      { action: 'login' },
    ])
    ready(socket, { userCode: 'K7PQ-3XRM' })
    const { loginUrl, userCode } = await pending
    expect(userCode).toBe('K7PQ-3XRM')
    const query = new URL(loginUrl).searchParams
    expect(query.get('transactionId')).toBe('tx-1')
    expect(query.get('client')).toBe('cli')
    expect(query.has('userCode')).toBe(false)
    expect(loginUrl).not.toContain('K7PQ')
  })

  it('returns no code from a broker that issues none', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { userCode } = await pending
    expect(userCode).toBeUndefined()
  })

  it('accepts the sign-in the broker relays', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket, { userCode: 'K7PQ-3XRM' })
    const { loginData } = await pending
    fulfilled(socket)
    await expect(loginData).resolves.toMatchObject({
      username: 'tester',
      user_uid: 'u1',
      refreshToken: 'r',
      idToken,
      name: 'Tester',
    })
    expect(socket.closed).toBe(true)
  })

  it('refuses a result that names another code', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket, { userCode: 'K7PQ-3XRM' })
    const { loginData } = await pending
    fulfilled(socket, { userCode: 'AAAA-AAAA' })
    await expect(loginData).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: expect.stringContaining('named a code other than'),
    })
    expect(socket.closed).toBe(true)
  })

  it('lets the caller close the connection', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { close } = await pending
    close()
    expect(socket.closed).toBe(true)
  })
})

// Before the broker replies, the caller has no `close` to call: the abort
// signal of its timeout closes the connection instead. An open connection
// would keep the process alive after the timeout error.
describe('loginViaBrowser with an abort signal', () => {
  beforeEach(() => {
    FakeSocket.reset()
  })

  it('closes the connection when the signal aborts before the broker replies', async () => {
    const controller = new AbortController()
    const pending = new Authentication({}).loginViaBrowser({
      signal: controller.signal,
    })
    const socket = await openedSocket()
    expect(socket.closed).toBe(false)
    controller.abort()
    expect(socket.closed).toBe(true)
    socket.onclose()
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('closes a connection opened after the signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const pending = new Authentication({}).loginViaBrowser({
      signal: controller.signal,
    })
    const socket = await openedSocket()
    expect(socket.closed).toBe(true)
    socket.onclose()
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('closes the connection when a non-interactive sign-in times out before the URL', async () => {
    const notices = []
    const pending = new Authentication({}).loginNonInteractive({
      notice: (text) => notices.push(text),
      timeoutMs: 20,
    })
    const socket = await openedSocket()
    await expect(pending).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: expect.stringContaining('Sign-in was not completed within'),
    })
    expect(socket.closed).toBe(true)
    expect(notices).toEqual([])
  })
})

// The sign-in used to wait on promises nothing would settle when the
// connection ended early, and the process then exited 0 without an error.
describe('loginViaBrowser when the connection ends early', () => {
  beforeEach(() => {
    FakeSocket.reset()
  })

  it('fails the sign-in when the connection closes before the URL', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    socket.onclose()
    await expect(pending).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: expect.stringContaining(
        'The sign-in connection closed before the sign-in completed',
      ),
    })
  })

  it('fails the wait when the connection closes after the URL', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { loginUrl, loginData } = await pending
    expect(loginUrl).toContain('transactionId=tx-1')
    socket.onclose()
    await expect(loginData).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('names the connection error', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    socket.onerror({ message: 'socket hang up' })
    await expect(pending).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: expect.stringContaining('(socket hang up)'),
    })
  })
})

// The login broker is reached over HTTPS, so the proxy is chosen as for the other HTTPS
// connections, the AWS SDK clients' among them.
describe('loginViaBrowser through a proxy', () => {
  const PROXY_VARS = [
    'proxy',
    'HTTP_PROXY',
    'http_proxy',
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'ca',
    'HTTPS_CA',
    'https_ca',
    'cafile',
    'HTTPS_CAFILE',
    'https_cafile',
  ]
  const savedEnv = {}

  beforeEach(() => {
    FakeSocket.reset()
    for (const name of PROXY_VARS) {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of PROXY_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name]
      else process.env[name] = savedEnv[name]
    }
  })

  const socketAgent = async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    socket.onclose()
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_FAILED' })
    return socket.options.agent
  }

  it('connects through HTTPS_PROXY when HTTP_PROXY and a generic proxy are set too', async () => {
    process.env.HTTP_PROXY = 'http://h:1'
    process.env.proxy = 'http://g:3'
    process.env.HTTPS_PROXY = 'http://s:2'
    const agent = await socketAgent()
    expect(agent.proxy.host).toBe('s:2')
  })

  it('connects through HTTP_PROXY when it is the only one set', async () => {
    process.env.HTTP_PROXY = 'http://h:1'
    expect((await socketAgent()).proxy.host).toBe('h:1')
  })

  it('connects directly when NO_PROXY covers the host', async () => {
    process.env.HTTPS_PROXY = 'http://s:2'
    process.env.NO_PROXY = '.serverless.com'
    expect(await socketAgent()).toBeUndefined()
  })

  // The CA settings keep the formats the direct connection accepts: a comma-separated HTTPS_CA
  // with escaped newlines, and a comma-separated list of HTTPS_CAFILE paths.
  it('gives the proxy connection every CA from a comma-separated HTTPS_CA', async () => {
    process.env.HTTPS_PROXY = 'https://s:2'
    process.env.HTTPS_CA = 'first\\ncert,second\\ncert'
    const agent = await socketAgent()
    expect(agent.connectOpts.ca).toEqual(['first\ncert', 'second\ncert'])
  })

  it('gives the proxy connection every file from a comma-separated HTTPS_CAFILE', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-ca-'))
    try {
      const first = path.join(dir, 'first.pem')
      const second = path.join(dir, 'second.pem')
      fs.writeFileSync(first, 'first cert')
      fs.writeFileSync(second, 'second cert')
      process.env.HTTPS_PROXY = 'https://s:2'
      process.env.HTTPS_CAFILE = `${first}, ${second}`
      const agent = await socketAgent()
      expect(agent.connectOpts.ca).toEqual(['first cert', 'second cert'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
