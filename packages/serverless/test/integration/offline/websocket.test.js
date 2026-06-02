import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/websocket')

// The WebSocket event shapes asserted below were captured from the community
// serverless-offline plugin (see fixtures/websocket/.captured/plugin.json) and
// validated against the AWS WebSocket API contract. The common, AWS-correct
// fields match the captured baseline: $connect → eventType=CONNECT /
// routeKey=$connect with headers + (when present) query params; a custom route
// message → eventType=MESSAGE / routeKey=broadcast / body=<frame> / messageId;
// $default fallback for unrouted frames; $disconnect → eventType=DISCONNECT /
// routeKey=$disconnect. Several fields are AWS-fidelity assertions where OUR
// offline is the AWS-correct one and the community plugin diverges:
//   1. requestContext.domainName — plugin hardcodes "localhost" (no port);
//      OUR offline reports the real host:port, so the value composed into the
//      @connections management endpoint actually routes. This is the reason
//      the two-client fan-out below works against ours but not the plugin
//      (the plugin's captured clientBReceived was null).
//   2. requestContext.stage — plugin hardcodes "local"; OURS is the real
//      configured stage ("dev"), and the @connections route is mounted at
//      /<stage>/@connections/{id} to match AWS.
//   3. messageId — plugin sets it on CONNECT/DISCONNECT too; AWS (and ours)
//      set it only on MESSAGE events.
//   4. $disconnect carries disconnectStatusCode / disconnectReason on AWS
//      (and ours); the plugin omits them.

function open(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => resolve(data.toString()))
    ws.once('error', reject)
  })
}

describe('websocket integration', () => {
  let offline
  let logDir
  let logPath

  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    // The fixture handler appends every received event to WS_EVENT_LOG so the
    // test can assert the $connect / $disconnect shapes a WS client can't read.
    logDir = await mkdtemp(path.join(tmpdir(), 'it-ws-log-'))
    logPath = path.join(logDir, 'events.log')
    offline = await bootOffline({
      cwd: FIXTURE,
      env: { WS_EVENT_LOG: logPath },
    })
  })

  afterAll(async () => {
    await offline?.stop()
    if (logDir) await rm(logDir, { recursive: true, force: true })
  })

  async function readEvents() {
    let text = ''
    try {
      text = await readFile(logPath, 'utf8')
    } catch {
      return []
    }
    return text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }

  it('delivers AWS-correct lifecycle events and fans out via @connections', async () => {
    // Two clients connect; client A carries a query string on its upgrade URL.
    const a = offline.wsConnect('?token=abc')
    await open(a)
    const b = offline.wsConnect()
    await open(b)
    await delay(300)

    // Client A sends an unrouted frame → $default; then a broadcast frame.
    a.send(JSON.stringify({ hello: 'plain' }))
    await delay(200)

    // End-to-end @connections proof: client B must RECEIVE the pushed message.
    const bReceived = nextMessage(b)
    a.send(JSON.stringify({ action: 'broadcast', data: 'hi' }))
    const pushed = await Promise.race([bReceived, delay(5000).then(() => null)])
    expect(pushed).toBe(JSON.stringify({ action: 'broadcast', data: 'hi' }))
    await delay(200)

    // Close both clients to drive $disconnect, with an explicit close code.
    a.close(1000, 'bye')
    b.close()
    // Wait for both $disconnect handlers to land in the log.
    const deadline = Date.now() + 5000
    let events = []
    while (Date.now() < deadline) {
      events = await readEvents()
      if (
        events.filter((e) => e.requestContext.eventType === 'DISCONNECT')
          .length >= 2
      )
        break
      await delay(100)
    }

    const connects = events.filter(
      (e) => e.requestContext.eventType === 'CONNECT',
    )
    const messages = events.filter(
      (e) => e.requestContext.eventType === 'MESSAGE',
    )
    const disconnects = events.filter(
      (e) => e.requestContext.eventType === 'DISCONNECT',
    )

    // --- $connect ---
    expect(connects).toHaveLength(2)
    const connectA = connects.find(
      (e) => e.queryStringParameters?.token === 'abc',
    )
    expect(connectA).toBeDefined()
    const cc = connectA.requestContext
    expect(cc.routeKey).toBe('$connect')
    expect(cc.eventType).toBe('CONNECT')
    expect(typeof cc.connectionId).toBe('string')
    expect(cc.connectionId.length).toBeGreaterThan(0)
    expect(typeof cc.connectedAt).toBe('number')
    expect(typeof cc.requestId).toBe('string')
    // AWS-correct: real host:port (routable) + real stage. Plugin hardcodes
    // "localhost" / "local".
    expect(cc.domainName).toMatch(/^localhost:\d+$/)
    expect(cc.stage).toBe('dev')
    // Headers present on $connect.
    expect(connectA.headers).toBeDefined()
    expect(connectA.headers.host).toMatch(/^localhost:\d+$/)
    expect(connectA.isBase64Encoded).toBe(false)
    expect(connectA.multiValueQueryStringParameters).toEqual({ token: ['abc'] })
    // AWS-correct: messageId is absent on CONNECT (plugin sets it).
    expect(cc.messageId).toBeUndefined()

    // --- custom route (broadcast) + $default ---
    const broadcast = messages.find(
      (e) => e.requestContext.routeKey === 'broadcast',
    )
    expect(broadcast).toBeDefined()
    expect(broadcast.requestContext.eventType).toBe('MESSAGE')
    expect(broadcast.body).toBe(
      JSON.stringify({ action: 'broadcast', data: 'hi' }),
    )
    expect(typeof broadcast.requestContext.messageId).toBe('string')
    expect(broadcast.isBase64Encoded).toBe(false)

    const dflt = messages.find((e) => e.requestContext.routeKey === '$default')
    expect(dflt).toBeDefined()
    expect(dflt.requestContext.eventType).toBe('MESSAGE')
    expect(dflt.body).toBe(JSON.stringify({ hello: 'plain' }))

    // --- $disconnect ---
    expect(disconnects.length).toBeGreaterThanOrEqual(2)
    const dc = disconnects[0].requestContext
    expect(dc.routeKey).toBe('$disconnect')
    expect(dc.eventType).toBe('DISCONNECT')
    // AWS-correct: disconnect carries the close code/reason (plugin omits both).
    const closedWithCode = disconnects.find(
      (e) => e.requestContext.disconnectStatusCode === 1000,
    )
    expect(closedWithCode).toBeDefined()
    expect(closedWithCode.requestContext.disconnectReason).toBe('bye')
  })
})
