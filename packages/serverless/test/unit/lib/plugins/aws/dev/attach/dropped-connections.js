// For jest tests only: fakes.js is also loaded by the scripts some tests run in a child process.
import net from 'net'
import tls from 'tls'
import { jest } from '@jest/globals'

/**
 * Every TLS connection opened from now on waits forever to connect, as with an endpoint whose
 * network drops the packets. Returns the spy; `mockRestore()` ends it.
 */
export const droppedConnections = () =>
  jest.spyOn(tls, 'connect').mockImplementation(() => {
    const socket = new net.Socket()
    socket.connecting = true
    return socket
  })
