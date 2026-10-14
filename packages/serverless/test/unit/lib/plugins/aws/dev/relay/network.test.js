import net from 'net'
import { describe, expect, test } from '@jest/globals'
import {
  ADDRESS_ATTEMPT_MS,
  connectFailureDetail,
  iotSocketOptions,
} from '../../../../../../../lib/plugins/aws/dev/relay/network.js'

/** A port nothing listens on: one a server had a moment ago. */
const closedPort = async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** The error Node.js gives for one address it tried, as it puts it in an AggregateError. */
const attemptError = (code, address, port = 443) =>
  Object.assign(new Error(`connect ${code} ${address}:${port}`), {
    code,
    errno: -1,
    syscall: 'connect',
    address,
    port,
  })

describe('connections to AWS IoT Core', () => {
  test('give each address 2 s, longer than one round trip to any region', () => {
    expect(ADDRESS_ATTEMPT_MS).toBe(2_000)
    // Node.js 24's default and Node.js 26's.
    for (const processDefaultMs of [250, 500]) {
      expect(iotSocketOptions({ processDefaultMs })).toEqual({
        autoSelectFamilyAttemptTimeout: 2_000,
      })
    }
  })

  test("keep the process's own attempt timeout when it is longer", () => {
    // --network-family-autoselection-attempt-timeout=5000 in NODE_OPTIONS.
    expect(iotSocketOptions({ processDefaultMs: 5_000 })).toEqual({
      autoSelectFamilyAttemptTimeout: 5_000,
    })
    // A Node.js without the setting (before 18.18).
    expect(iotSocketOptions({ processDefaultMs: null })).toEqual({
      autoSelectFamilyAttemptTimeout: 2_000,
    })
  })

  test("default to this process's setting", () => {
    // The getter exists from Node.js 18.18.
    expect(iotSocketOptions()).toEqual({
      autoSelectFamilyAttemptTimeout: Math.max(
        2_000,
        net.getDefaultAutoSelectFamilyAttemptTimeout?.() ?? 0,
      ),
    })
  })
})

describe('what a failed connection says', () => {
  test('every address Node.js tried, with its family and outcome', () => {
    // What a machine without an IPv6 route got from a region more than 250 ms away.
    const error = Object.assign(
      new AggregateError([
        attemptError('ETIMEDOUT', '13.239.218.38'),
        attemptError('EHOSTUNREACH', '2406:da1c:28e:3800:51e:783a:6023:fd2f'),
      ]),
      { code: 'ETIMEDOUT' },
    )
    expect(error.message).toBe('')
    expect(connectFailureDetail(error)).toBe(
      'timed out at 13.239.218.38:443 over IPv4; no route to [2406:da1c:28e:3800:51e:783a:6023:fd2f]:443 over IPv6',
    )
  })

  test('refused, unreachable networks and other codes', () => {
    const error = new AggregateError([
      attemptError('ECONNREFUSED', '10.0.0.1'),
      attemptError('ENETUNREACH', '2001:db8::1'),
      attemptError('ECONNRESET', '10.0.0.2'),
    ])
    expect(connectFailureDetail(error)).toBe(
      'refused at 10.0.0.1:443 over IPv4; no route to [2001:db8::1]:443 over IPv6; ECONNRESET at 10.0.0.2:443 over IPv4',
    )
  })

  test("the port tells a proxy's addresses from the endpoint's", () => {
    // HTTPS_PROXY=http://localhost:3128 with nothing listening there.
    const error = new AggregateError([
      attemptError('ECONNREFUSED', '::1', 3128),
      attemptError('ECONNREFUSED', '127.0.0.1', 3128),
    ])
    expect(connectFailureDetail(error)).toBe(
      'refused at [::1]:3128 over IPv6; refused at 127.0.0.1:3128 over IPv4',
    )
    // An attempt without a port names the address alone.
    const { port, ...portless } = attemptError('ETIMEDOUT', '10.0.0.1')
    expect(connectFailureDetail(new AggregateError([portless]))).toBe(
      'timed out at 10.0.0.1 over IPv4',
    )
  })

  test('the AggregateError of a real connection to two addresses', async () => {
    const port = await closedPort()
    const error = await new Promise((resolve) => {
      const socket = net.connect({
        host: 'iot.example.test',
        port,
        autoSelectFamily: true,
        lookup: (_host, _options, callback) =>
          callback(null, [
            { address: '127.0.0.1', family: 4 },
            { address: '::1', family: 6 },
          ]),
      })
      socket.on('error', resolve)
    })
    // Node.js's own AggregateError (not this test realm's, under jest).
    expect(error.name).toBe('AggregateError')
    expect(error.message).toBe('')
    // ::1 is refused, or not available where the machine has no IPv6 at all.
    expect(connectFailureDetail(error)).toMatch(
      /^refused at 127\.0\.0\.1:\d+ over IPv4; .+ \[::1\]:\d+ over IPv6$/,
    )
  })

  test('any other error says what its message says, else its code', () => {
    expect(connectFailureDetail(new Error('connect ECONNREFUSED'))).toBe(
      'connect ECONNREFUSED',
    )
    expect(
      connectFailureDetail(Object.assign(new Error(''), { code: 'ETIMEDOUT' })),
    ).toBe('ETIMEDOUT')
    expect(connectFailureDetail(new AggregateError([], ''))).toBe(
      'no details from the network',
    )
    expect(connectFailureDetail('socket hang up')).toBe('socket hang up')
    expect(connectFailureDetail(undefined)).toBe('no details from the network')
  })
})
