import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/schedule')

// The scheduled-event shape asserted below was captured from the community
// serverless-offline plugin (see fixtures/schedule/.captured/schedule.json) and
// validated against the AWS EventBridge scheduled-event contract. The common,
// AWS-correct fields match the captured baseline: an EventBridge scheduled
// event carries version "0", an id, detail-type "Scheduled Event", source
// "aws.events", a time, the region, a resources array, and an empty detail {}.
// A schedule with an `input` override delivers that input verbatim AS the event
// (replacing the synthesized scheduled-event), which both sides and AWS honor.

describe('schedule integration', () => {
  let offline
  let logDir
  let logPath

  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    // The fixture handler appends every received event to SCHEDULE_EVENT_LOG so
    // the test can assert the exact scheduled-event shape (mirrors the
    // websocket event-log-to-file pattern).
    logDir = await mkdtemp(path.join(tmpdir(), 'it-sched-log-'))
    logPath = path.join(logDir, 'events.log')
    offline = await bootOffline({
      cwd: FIXTURE,
      env: { SCHEDULE_EVENT_LOG: logPath },
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

  it('fires both scheduled functions on cadence with AWS-correct event + input parity', async () => {
    // rate(1 minute) / cron(0/1 * * * ? *) both fire at the next wall-clock
    // minute boundary. Poll the event log generously (the integration runner's
    // testTimeout is 600000); a tick should land within ~75s worst case.
    const deadline = Date.now() + 80_000
    let events = []
    while (Date.now() < deadline) {
      events = await readEvents()
      const haveTicker = events.some((e) => e.marker === 'ticker')
      const haveCron = events.some((e) => e.marker === 'cronInput')
      if (haveTicker && haveCron) break
      await delay(1000)
    }

    // --- firing ---
    // Marker also appears on stdout; the event log proves the handler ran.
    const ticker = events.find((e) => e.marker === 'ticker')
    const cron = events.find((e) => e.marker === 'cronInput')
    expect(ticker).toBeDefined()
    expect(cron).toBeDefined()
    expect(offline.logs()).toMatch(/SCHEDULE_FIRED ticker/)

    // --- AWS EventBridge scheduled-event shape (rate(1 minute) function) ---
    const ev = ticker.event
    expect(ev.version).toBe('0')
    expect(typeof ev.id).toBe('string')
    expect(ev.id.length).toBeGreaterThan(0)
    expect(ev['detail-type']).toBe('Scheduled Event')
    expect(ev.source).toBe('aws.events')
    // time is an ISO-8601 instant without milliseconds, e.g. 2026-06-02T00:47:00Z
    expect(ev.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(ev.region).toBe('us-east-1')
    expect(Array.isArray(ev.resources)).toBe(true)
    expect(ev.detail).toEqual({})

    // --- input override (cron-with-input function) ---
    // The `input` block is delivered verbatim AS the event, replacing the
    // synthesized scheduled-event. Matches AWS + the captured plugin baseline.
    expect(cron.event).toEqual({ foo: 'bar' })
  })
})
