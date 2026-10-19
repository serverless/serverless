import { jest } from '@jest/globals'

// A stand-in for the login broker's WebSocket: the test drives its events.
class FakeSocket {
  static last = null
  constructor(url, protocols, options) {
    this.url = url
    this.options = options
    FakeSocket.last = this
  }
  send() {}
  close() {}
}
jest.unstable_mockModule('ws', () => ({ default: FakeSocket }))

const { Authentication } = await import('../../../../src/lib/auth/index.js')

// loginViaBrowser opens the socket after two awaits; wait until it exists.
const openedSocket = async () => {
  for (let i = 0; i < 50 && !FakeSocket.last; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  return FakeSocket.last
}

const ready = (socket) =>
  socket.onmessage({
    data: JSON.stringify({ event: 'ready', transactionId: 'tx-1' }),
  })

// The sign-in used to wait on promises nothing would settle when the
// connection ended early, and the process then exited 0 without an error.
describe('loginViaBrowser when the connection ends early', () => {
  beforeEach(() => {
    FakeSocket.last = null
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
  ]
  const savedEnv = {}

  beforeEach(() => {
    FakeSocket.last = null
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
})
