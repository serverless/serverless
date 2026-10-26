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

const { Authentication, USER_CODE_PATTERN, generateUserCode } =
  await import('../../../../src/lib/auth/index.js')

// loginViaBrowser opens the socket only after its awaits settle, which include reading the CA
// files, so a fixed number of event-loop turns isn't enough: wait for the socket itself.
const openedSocket = () => FakeSocket.opened

const ready = (socket) =>
  socket.onmessage({
    data: JSON.stringify({ event: 'ready', transactionId: 'tx-1' }),
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

// The user code ties a browser sign-in to the CLI that asked for it: the CLI
// prints it, the Dashboard shows it for the person to confirm, and the result
// must carry it back. A URL that reaches someone who did not run the command
// (phishing) shows a code they cannot compare with anything.
describe('loginViaBrowser user code', () => {
  beforeEach(() => {
    FakeSocket.reset()
  })

  it('generates codes of two groups of four unambiguous characters', () => {
    const codes = new Set(Array.from({ length: 50 }, generateUserCode))
    for (const code of codes) expect(code).toMatch(USER_CODE_PATTERN)
    expect(codes.size).toBeGreaterThan(45)
  })

  it('sends the code to the broker, puts it in the URL, and returns it', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    socket.onopen()
    expect(socket.sent).toHaveLength(1)
    const request = JSON.parse(socket.sent[0])
    expect(request.action).toBe('login')
    expect(request.userCode).toMatch(USER_CODE_PATTERN)
    ready(socket)
    const { loginUrl, userCode } = await pending
    expect(userCode).toBe(request.userCode)
    expect(new URL(loginUrl).searchParams.get('userCode')).toBe(userCode)
    expect(new URL(loginUrl).searchParams.get('transactionId')).toBe('tx-1')
  })

  it('accepts a result that echoes the code', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { loginData, userCode } = await pending
    fulfilled(socket, { userCode })
    await expect(loginData).resolves.toMatchObject({
      username: 'tester',
      user_uid: 'u1',
      refreshToken: 'r',
      idToken,
      name: 'Tester',
    })
    expect(socket.closed).toBe(true)
  })

  it('refuses a result that carries another code', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { loginData } = await pending
    fulfilled(socket, { userCode: 'AAAA-AAAA' })
    await expect(loginData).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: expect.stringContaining('did not carry the code'),
    })
    expect(socket.closed).toBe(true)
  })

  it('refuses a result that carries no code', async () => {
    const pending = new Authentication({}).loginViaBrowser()
    const socket = await openedSocket()
    ready(socket)
    const { loginData } = await pending
    fulfilled(socket)
    await expect(loginData).rejects.toMatchObject({ code: 'AUTH_FAILED' })
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
