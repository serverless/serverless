/**
 * How this machine's connections to the account's AWS IoT Core endpoint pick an address, and what a
 * failed one says. The endpoint's host name has an IPv4 and an IPv6 address. Node.js tries a host's
 * addresses one after the other (`autoSelectFamily`, on by default since Node.js 20) and gives up
 * on each one that has not answered within its attempt timeout: 250 ms by default (500 ms from
 * Node.js 26). A TCP handshake takes one round trip, so from a machine further than that from the
 * region whose IPv6 has no route, the IPv4 attempt is given up before it can answer, the IPv6 one
 * fails at once, and the connection fails every time. Through a proxy, Node.js connects only to the
 * proxy, with its own defaults: every AWS request of the CLI goes the same way.
 */
import net from 'net'

/**
 * How long each address of the endpoint gets to answer: well over a round trip to the farthest
 * region, and the upper bound RFC 8305 sets for the delay between attempts. An address that never
 * answers delays the next one by this long, once per connection.
 */
export const ADDRESS_ATTEMPT_MS = 2_000

/**
 * The socket options for a connection to AWS IoT Core: ADDRESS_ATTEMPT_MS per address, or the
 * process's own attempt timeout when that is longer
 * (`--network-family-autoselection-attempt-timeout` in NODE_OPTIONS). An `autoSelectFamily` the
 * process turned off stays off.
 */
export const iotSocketOptions = ({
  processDefaultMs = net.getDefaultAutoSelectFamilyAttemptTimeout?.(),
} = {}) => ({
  autoSelectFamilyAttemptTimeout: Math.max(
    ADDRESS_ATTEMPT_MS,
    Number.isFinite(processDefaultMs) ? processDefaultMs : 0,
  ),
})

const FAMILIES = { 4: 'IPv4', 6: 'IPv6' }

const attemptLine = ({ code, address, port }) => {
  const version = net.isIP(address)
  const family = FAMILIES[version] ?? 'IP'
  // The port tells the endpoint (443) from a proxy.
  const at = port
    ? `${version === 6 ? `[${address}]` : address}:${port}`
    : address
  if (code === 'ETIMEDOUT') return `timed out at ${at} over ${family}`
  if (code === 'ECONNREFUSED') return `refused at ${at} over ${family}`
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `no route to ${at} over ${family}`
  }
  return `${code} at ${at} over ${family}`
}

/**
 * What a failed connection says, for a message. Node.js reports a connection that tried several
 * addresses as an AggregateError with an empty message: its errors name each address and what
 * happened there ("timed out at 3.104.179.222:443 over IPv4; no route to [2406:da1c::1]:443 over
 * IPv6").
 */
export const connectFailureDetail = (error) => {
  const attempts = Array.isArray(error?.errors)
    ? error.errors.filter((attempt) => attempt?.address)
    : []
  if (attempts.length > 0) return attempts.map(attemptLine).join('; ')
  if (typeof error === 'string' && error) return error
  return error?.message || error?.code || 'no details from the network'
}
