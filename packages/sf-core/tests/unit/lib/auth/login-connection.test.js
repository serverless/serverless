import { jest } from '@jest/globals'

// A stand-in for the login broker's WebSocket: the test drives its events.
class FakeSocket {
  static last = null
  constructor() {
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
