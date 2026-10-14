import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { PassThrough } from 'stream'
import { fileURLToPath } from 'url'
import {
  ACCEPT_MARGIN_MS,
  ACCEPT_RETURN_MS,
  ACCEPT_WINDOW_MS,
  REFUSAL_GRACE_MS,
  RELAY_FAILED,
  STREAM_OBJECT_BYTES,
  UNSENT_ACCEPTANCE_MS,
  UPLOAD_WAIT_MS,
  createRelay,
} from '../../../../../../../lib/plugins/aws/dev/relay/relay.js'
import { createPacer } from '../../../../../../../lib/plugins/aws/dev/relay/pacer.js'
import { manualClock } from './manual-clock.js'
import { withoutSecrets } from '../../../../../../../lib/plugins/aws/dev/relay/redact.js'
import { MAX_CLOCK_SKEW_MS } from '../../../../../../../lib/plugins/aws/dev/relay/clock.js'
import {
  FRAME_OVERHEAD_BYTES,
  KIND,
  STREAM_CHUNK_BYTES,
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { createLocalRuntime } from '../../../../../../../lib/plugins/aws/dev/local/runtime.js'
import { nodeAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import { countingTimers } from '../attach/fakes.js'
import { baseEnv, cleanTempDirs, tempDir, write } from '../local/helpers.js'

jest.setTimeout(60_000)

const here = path.dirname(fileURLToPath(import.meta.url))
const BRIDGE = path.resolve(
  here,
  '../../../../../../../../../dev-mode-bridge/internal/bridge',
)

const key = Buffer.alloc(32, 3)
const session = 's_0123456789ab'
const topics = topicsOf(session)
const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (check, ms = 5_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await settle(10)
  }
}

// The function role's credentials, as the bridge forwards them: they must never reach a log.
const ROLE = {
  AWS_ACCESS_KEY_ID: 'ASIAROLEKEYNEVERLOGGED',
  AWS_SECRET_ACCESS_KEY: 'role-secret-never-logged',
  AWS_SESSION_TOKEN: 'role-token-never-logged',
}
const SECRETS = Object.values(ROLE)

const relays = []
const unhandled = []
const onUnhandled = (reason) => unhandled.push(reason)
beforeAll(() => process.on('unhandledRejection', onUnhandled))
afterAll(() => process.off('unhandledRejection', onUnhandled))

/** Every header value the relay sends is an integer or a string (the bridge drops anything else). */
const assertWireTypes = (value, where) => {
  if (typeof value === 'string') return
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${where} is ${value}, not an integer`)
    }
    return
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [name, inner] of Object.entries(value)) {
      assertWireTypes(inner, `${where}.${name}`)
    }
    return
  }
  throw new Error(`${where} is ${JSON.stringify(value)}`)
}

afterEach(async () => {
  for (const entry of relays.splice(0)) {
    await entry.relay.drain(2_000)
    expect(entry.timers.live()).toBe(0)
    for (const frame of entry.sent) assertWireTypes(frame.header, 'header')
    for (const line of entry.lines) {
      for (const secret of SECRETS) expect(line).not.toContain(secret)
    }
  }
  expect(unhandled).toEqual([])
  cleanTempDirs()
})

/**
 * The relay with a recording publish (what the bridge would receive, opened) and a fake runtime.
 * `publish` may replace the recording one per frame: it gets the opened frame and returns what the
 * transport would (true, false or a rejection), or undefined to record it as sent.
 */
const setup = ({
  invoke,
  sideChannel,
  now = Date.now,
  publish,
  runtime,
  functions = new Map([['svc-dev-api', 'api']]),
  rememberedEnvironments,
} = {}) => {
  const timers = countingTimers()
  const sent = []
  const attempts = []
  const open = createOpener({ key })
  const requests = []
  const lines = []
  const notRun = []
  const passed = []
  const relay = createRelay({
    sessionId: session,
    key,
    functions,
    ...(rememberedEnvironments && { rememberedEnvironments }),
    runtime: runtime ?? {
      invoke: async (request) => {
        requests.push(request)
        return invoke
          ? invoke(request)
          : {
              kind: 'response',
              contentType: 'application/json',
              body: Buffer.from('{"ok":1}'),
            }
      },
    },
    publish: async ({ topic, payload, priority, deadline, onDropped }) => {
      const frame = {
        topic,
        priority,
        deadline,
        onDropped,
        ...open(topic, payload),
      }
      attempts.push(frame)
      if (publish) {
        const result = await publish(frame)
        if (result !== undefined) return result
      }
      if (deadline !== undefined && deadline < now()) return false
      sent.push(frame)
      return true
    },
    sideChannel,
    now,
    timers,
    logger: { debug: (text) => lines.push(String(text)) },
    onNotRun: (details) => notRun.push(details),
    onPassed: (details) => passed.push(details),
  })
  const entry = {
    relay,
    sent,
    attempts,
    requests,
    timers,
    lines,
    notRun,
    passed,
  }
  relays.push(entry)
  return entry
}

const bridge = createSealer({ key })
const invokeFrame = (header = {}, body = Buffer.from('{}')) =>
  bridge(
    topics.up,
    {
      kind: KIND.INVOKE,
      env: 'e1',
      fn: 'svc-dev-api',
      id: 'r1',
      sentAt: Date.now(),
      remainingMs: 5_000,
      headers: {
        'lambda-runtime-aws-request-id': header.id ?? 'r1',
        'lambda-runtime-deadline-ms': '1',
      },
      ...header,
    },
    body,
  )
/**
 * Whether what a handler still writes to its stream is read: 4 MiB written and ended, the stream
 * finishes only once every byte was taken from it.
 */
const readToTheEnd = async (body) => {
  let finished = false
  body.on('finish', () => {
    finished = true
  })
  for (let i = 0; i < 64; i++) body.write(Buffer.alloc(64 * 1024))
  body.end()
  try {
    await waitFor(() => finished, 2_000)
  } catch {
    return false
  }
  return true
}
const kinds = (sent) => sent.map((frame) => frame.header.kind)
const idKinds = (sent) => sent.map((f) => `${f.header.id}:${f.header.kind}`)
const errorOf = (frame) => JSON.parse(frame.body.toString('utf8'))
const trailerOf = (frame) =>
  JSON.parse(Buffer.from(frame.header.errorBody, 'base64').toString('utf8'))

describe('the laptop relay and the cap on handler processes', () => {
  test('when every handler process is busy, nothing is accepted: the deployed code answers, and it is counted', async () => {
    const invoke = jest.fn()
    const { relay, sent, notRun } = setup({
      runtime: { reserve: () => null, invoke },
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(kinds(sent)).toEqual(['not_in_dev'])
    expect(invoke).not.toHaveBeenCalled()
    expect(notRun).toEqual([
      { id: 'r1', functionKey: 'api', reason: 'worker_limit' },
    ])
  })

  test('an event in the deployment bucket is deleted, with its version, whenever the laptop does not take the request', async () => {
    const s3 = { key: 'in-1', versionId: 'v1' }
    const refusals = {
      // Every handler process is busy.
      worker_limit: {
        options: { runtime: { reserve: () => null, invoke: jest.fn() } },
        header: { environment: {} },
      },
      // The function is not in this session.
      not_in_session: { header: { fn: 'svc-dev-other', environment: {} } },
      // A replay, or a request that arrived too late.
      stale: { header: { sentAt: 1, environment: {} } },
      // The environment is not known yet: the bridge never offers an uploaded event again.
      need_environment: { header: {} },
      // The acceptance could not be sent in time.
      not_accepted: {
        options: {
          publish: (frame) =>
            frame.header.kind === 'accepted' ? false : undefined,
        },
        header: { environment: {} },
      },
    }
    for (const [name, { options = {}, header }] of Object.entries(refusals)) {
      const discarded = []
      const order = []
      const { relay, sent, requests } = setup({
        ...options,
        sideChannel: {
          enabled: true,
          download: jest.fn(),
          discard: async (object) => {
            order.push(`discard:${sent.length}`)
            discarded.push(object)
          },
        },
      })
      relay.receive(topics.up, invokeFrame({ ...header, s3 }, Buffer.alloc(0)))
      await settle()
      expect([name, discarded]).toEqual([name, [s3]])
      expect([name, requests]).toEqual([name, []])
      // The deployed code is told first; the delete follows.
      expect([name, order]).toEqual([name, [`discard:${sent.length}`]])
    }
  })

  test('an event the laptop takes is deleted by its download only, and a failed delete of one it does not take is left to the sweep', async () => {
    const discard = jest.fn()
    const taken = setup({
      sideChannel: {
        enabled: true,
        download: async () => Buffer.from('{}'),
        discard,
      },
    })
    taken.relay.receive(
      topics.up,
      invokeFrame({ environment: {}, s3: { key: 'in-1' } }, Buffer.alloc(0)),
    )
    await settle()
    expect(kinds(taken.sent)).toEqual(['accepted', 'response'])
    expect(discard).not.toHaveBeenCalled()

    const failing = setup({
      runtime: { reserve: () => null, invoke: jest.fn() },
      sideChannel: {
        enabled: true,
        download: jest.fn(),
        discard: async () => {
          throw new Error('AccessDenied')
        },
      },
    })
    failing.relay.receive(
      topics.up,
      invokeFrame({ environment: {}, s3: { key: 'in-2' } }, Buffer.alloc(0)),
    )
    await settle()
    expect(kinds(failing.sent)).toEqual(['not_in_dev'])
    expect(failing.lines.join('\n')).toMatch(
      /could not delete the event of r1 .*AccessDenied/,
    )

    // Without the side channel there is nothing to delete.
    const off = setup({
      runtime: { reserve: () => null, invoke: jest.fn() },
      sideChannel: { enabled: false, reason: 's3:PutObject was denied' },
    })
    off.relay.receive(
      topics.up,
      invokeFrame({ environment: {}, s3: { key: 'in-3' } }, Buffer.alloc(0)),
    )
    await settle()
    expect(kinds(off.sent)).toEqual(['not_in_dev'])
  })

  test('an accepted invocation the runtime then finds no process for is counted as worker_limit', async () => {
    const { relay, sent, notRun } = setup({
      runtime: {
        reserve: () => ({ release() {} }),
        invoke: async () => ({ kind: 'not_in_dev', reason: 'worker_limit' }),
      },
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(kinds(sent)).toEqual(['accepted', 'not_in_dev'])
    expect(notRun).toEqual([
      { id: 'r1', functionKey: 'api', reason: 'worker_limit' },
    ])
  })

  test('a reserved place goes with the accepted invocation, and back when the acceptance is not sent', async () => {
    const slots = []
    const reserve = ({ functionKey, environmentId }) => {
      const slot = {
        functionKey,
        environmentId,
        released: 0,
        release() {
          slot.released += 1
        },
      }
      slots.push(slot)
      return slot
    }
    const requests = []
    const runtime = {
      reserve,
      invoke: async (request) => {
        requests.push(request)
        return {
          kind: 'response',
          contentType: 'application/json',
          body: Buffer.from('{}'),
        }
      },
    }
    const accepted = setup({ runtime })
    accepted.relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(kinds(accepted.sent)).toEqual(['accepted', 'response'])
    expect(requests[0].slot).toBe(slots[0])
    expect(slots[0]).toMatchObject({ functionKey: 'api', environmentId: 'e1' })
    expect(slots[0].released).toBeGreaterThan(0)

    const late = setup({
      runtime,
      publish: (frame) =>
        frame.header.kind === 'accepted' ? false : undefined,
    })
    late.relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(requests).toHaveLength(1)
    expect(slots[1].released).toBeGreaterThan(0)
  })
})

describe('the laptop relay', () => {
  test('accepts before it runs, answers on the environment topic, rebases the deadline and drops an exact copy', async () => {
    const { relay, sent, requests } = setup()
    const frame = invokeFrame({ environment: { A: '1' } })
    relay.receive(topics.up, frame)
    await settle()
    expect(kinds(sent)).toEqual(['accepted', 'response'])
    expect(sent.every((f) => f.topic === topics.down('e1'))).toBe(true)
    expect(sent.map((f) => f.priority)).toEqual(['acceptance', 'control'])
    expect(requests[0]).toMatchObject({
      functionKey: 'api',
      environmentId: 'e1',
      environment: { A: '1' },
    })
    const deadline = Number(requests[0].headers['lambda-runtime-deadline-ms'])
    expect(deadline).toBeGreaterThan(Date.now() + 4_000)
    expect(deadline).toBeLessThan(Date.now() + 5_000)
    expect(sent[1].body.toString()).toBe('{"ok":1}')
    expect(sent[1].header).toMatchObject({
      contentType: 'application/json',
    })
    // AWS IoT Core delivers a QoS 1 message twice now and then: the copy is dropped.
    relay.receive(topics.up, frame)
    await settle()
    expect(requests).toHaveLength(1)
  })

  test('an asynchronous retry with the same request id runs again', async () => {
    const { relay, sent, requests } = setup()
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    relay.receive(topics.up, invokeFrame({}))
    await settle()
    expect(requests).toHaveLength(2)
    expect(idKinds(sent)).toEqual([
      'r1:accepted',
      'r1:response',
      'r1:accepted',
      'r1:response',
    ])
  })

  test('a function outside the session is not_in_dev; a missing environment is asked for once', async () => {
    const { relay, sent, requests } = setup()
    relay.receive(
      topics.up,
      invokeFrame({ fn: 'someone-else', id: 'r0', environment: {} }),
    )
    relay.receive(topics.up, invokeFrame({ id: 'r2' }))
    await settle()
    expect(idKinds(sent).sort()).toEqual([
      'r0:not_in_dev',
      'r2:need_environment',
    ])
    relay.receive(topics.up, invokeFrame({ id: 'r2', environment: { B: '2' } }))
    await settle()
    expect(requests).toHaveLength(1)
    expect(requests[0].environment).toEqual({ B: '2' })
    // The environment is remembered per execution environment.
    relay.receive(topics.up, invokeFrame({ id: 'r3' }))
    await settle()
    expect(requests[1].environment).toEqual({ B: '2' })
    relay.receive(topics.up, invokeFrame({ id: 'r4', env: 'e2' }))
    await settle()
    expect(idKinds(sent).slice(-1)).toEqual(['r4:need_environment'])
    expect(requests).toHaveLength(2)
  })

  test("the invoke sent again with the environment is measured from its own stamp: the question's round trip is not its age", async () => {
    let now = 1_000_000
    const { relay, sent, requests } = setup({ now: () => now })
    relay.receive(
      topics.up,
      invokeFrame({ id: 'r0', environment: {}, sentAt: now - 100 }),
    )
    await settle()
    // Another execution environment, without its variables: asked for them.
    const firstSentAt = now - 100
    relay.receive(
      topics.up,
      invokeFrame({ id: 'r1', env: 'e2', sentAt: firstSentAt }),
    )
    await settle()
    // The bridge sends it again one slow round trip later, as a new offer.
    now += 1_600
    relay.receive(
      topics.up,
      invokeFrame({ id: 'r1', env: 'e2', environment: {}, sentAt: now - 100 }),
    )
    // Had it kept the first stamp, the round trip would be its age, and its window would be gone.
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'r2',
        env: 'e2',
        environment: {},
        sentAt: firstSentAt,
      }),
    )
    await settle()
    expect(idKinds(sent).sort()).toEqual([
      'r0:accepted',
      'r0:response',
      'r1:accepted',
      'r1:need_environment',
      'r1:response',
      'r2:expired',
    ])
    expect(requests).toHaveLength(2)
  })

  test('a request whose budget is spent is refused and never runs', async () => {
    let now = 1_000_000
    const { relay, sent, requests, notRun } = setup({ now: () => now })
    // The fastest trip: 50 ms.
    relay.receive(
      topics.up,
      invokeFrame({ id: 'fast', environment: {}, sentAt: now - 50 }),
    )
    await settle()
    now += 10
    const window = ACCEPT_WINDOW_MS
    // 1 ms of budget left: accepted.
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'just',
        sentAt: now - 50 - (window - ACCEPT_RETURN_MS - 1),
      }),
    )
    await settle()
    now += 10
    // No budget left: refused.
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'slow',
        sentAt: now - 50 - (window - ACCEPT_RETURN_MS),
      }),
    )
    await settle()
    expect(idKinds(sent)).toEqual([
      'fast:accepted',
      'fast:response',
      'just:accepted',
      'just:response',
      'slow:expired',
    ])
    expect(
      requests.map((r) => r.headers['lambda-runtime-aws-request-id']),
    ).toEqual(['fast', 'just'])
    expect(notRun).toEqual([
      { id: 'slow', functionKey: 'api', reason: 'expired' },
    ])
  })

  test("the acceptance deadline shrinks with the request's age", async () => {
    let now = 1_000_000
    const { relay, sent } = setup({ now: () => now })
    relay.receive(
      topics.up,
      invokeFrame({ id: 'fast', environment: {}, sentAt: now - 50 }),
    )
    await settle()
    const fastAt = now
    now += 1_000
    relay.receive(topics.up, invokeFrame({ id: 'aged', sentAt: now - 450 }))
    await settle()
    const accepted = sent.filter((f) => f.header.kind === 'accepted')
    expect(accepted.map((f) => f.deadline)).toEqual([
      fastAt + ACCEPT_WINDOW_MS - ACCEPT_RETURN_MS,
      now + ACCEPT_WINDOW_MS - ACCEPT_RETURN_MS - 400,
    ])
  })

  test('a short remainingMs shortens the window; an unknown one keeps it', async () => {
    const now = 1_000_000
    const { relay, sent } = setup({ now: () => now })
    const offer = (id, remainingMs) =>
      relay.receive(
        topics.up,
        invokeFrame({ id, environment: {}, sentAt: now, remainingMs }),
      )
    offer('short', ACCEPT_RETURN_MS + ACCEPT_MARGIN_MS + 100)
    offer('none', ACCEPT_RETURN_MS + ACCEPT_MARGIN_MS)
    offer('unknown', 0)
    await settle()
    const accepted = Object.fromEntries(
      sent
        .filter((f) => f.header.kind === 'accepted')
        .map((f) => [f.header.id, f.deadline]),
    )
    expect(accepted).toEqual({
      short: now + 100,
      unknown: now + ACCEPT_WINDOW_MS - ACCEPT_RETURN_MS,
    })
    expect(idKinds(sent)).toContain('none:expired')
  })

  test('every answer before an acceptance carries the deadline after which the bridge no longer waits for it', async () => {
    const now = Date.now()
    const window = ACCEPT_WINDOW_MS + REFUSAL_GRACE_MS
    const cases = [
      ['not in this session', {}, { fn: 'svc-dev-other', environment: {} }],
      ['stale', {}, { sentAt: 1, environment: {} }],
      ['no environment yet', {}, {}],
      [
        'every process busy',
        { runtime: { reserve: () => null, invoke: jest.fn() } },
        { environment: {} },
      ],
    ]
    for (const [, options, header] of cases) {
      const { relay, sent } = setup({ now: () => now, ...options })
      relay.receive(topics.up, invokeFrame({ sentAt: now, ...header }))
      await settle()
      expect(sent).toHaveLength(1)
      expect(sent[0].deadline).toBe(now + window)
    }
    // Too little time left to accept: the bridge waits only until its shorter window closes.
    const short = setup({ now: () => now })
    short.relay.receive(
      topics.up,
      invokeFrame({
        sentAt: now,
        environment: {},
        remainingMs: ACCEPT_RETURN_MS + ACCEPT_MARGIN_MS,
      }),
    )
    await settle()
    expect(idKinds(short.sent)).toEqual(['r1:expired'])
    expect(short.sent[0].deadline).toBe(
      now + ACCEPT_RETURN_MS + REFUSAL_GRACE_MS,
    )
    // A stopping session.
    const stopping = setup({ now: () => now })
    stopping.relay.stopAccepting()
    stopping.relay.receive(topics.up, invokeFrame({ sentAt: now }))
    await settle()
    expect(stopping.sent[0].deadline).toBe(now + window)
    // An upload URL is waited for UPLOAD_WAIT_MS.
    const upload = setup({
      now: () => now,
      sideChannel: {
        enabled: true,
        uploadUrl: async () => ({ key: 'spare' }),
        download: async () => Buffer.alloc(0),
      },
    })
    upload.relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    await settle()
    expect(upload.sent[0]).toMatchObject({
      header: { kind: 'upload_url', id: 'r3' },
      deadline: now + UPLOAD_WAIT_MS,
    })
  })

  test('an acceptance is sent ahead of a burst of refusals, and refusals the bridge no longer waits for are dropped', async () => {
    const clock = manualClock(Date.now())
    const sent = []
    const dropped = []
    const pacer = createPacer({
      send: async ({ topic, payload }) =>
        sent.push(createOpener({ key })(topic, payload).header),
      now: clock.now,
      timers: clock.timers,
      onDrop: () => dropped.push(clock.now()),
    })
    const requests = []
    const relay = createRelay({
      sessionId: session,
      key,
      functions: new Map([['svc-dev-api', 'api']]),
      runtime: {
        invoke: async (request) => {
          requests.push(request)
          return { kind: 'response', body: Buffer.from('{}') }
        },
      },
      publish: (item) => pacer.publish(item),
      now: clock.now,
      timers: clock.timers,
      logger: { debug: () => {} },
    })
    // A scaling burst: 300 offers of a function this session does not have, then one it takes.
    for (let i = 0; i < 300; i++) {
      relay.receive(
        topics.up,
        invokeFrame({
          id: `x${i}`,
          env: `x${i}`,
          fn: 'svc-dev-other',
          sentAt: clock.now(),
        }),
      )
    }
    await clock.flush()
    relay.receive(
      topics.up,
      invokeFrame({ id: 'take', environment: {}, sentAt: clock.now() }),
    )
    await clock.advance(10_000)
    const order = sent.map((header) => `${header.id}:${header.kind}`)
    // The acceptance went out within the first second, ahead of the refusals still waiting.
    expect(order.indexOf('take:accepted')).toBeLessThan(90)
    expect(order).toContain('take:response')
    expect(requests).toHaveLength(1)
    // What could not be sent while the bridge waited was dropped, not sent late.
    expect(dropped.length).toBeGreaterThan(0)
    expect(sent.filter((h) => h.kind === 'not_in_dev').length).toBeLessThan(300)
    pacer.close()
  })

  test('more time left than a Lambda invocation can have is unknown: the full window, and no deadline for the handler', async () => {
    const now = Date.now()
    const { relay, sent, requests } = setup({ now: () => now })
    relay.receive(
      topics.up,
      invokeFrame({ environment: {}, sentAt: now, remainingMs: 1e15 }),
    )
    await settle()
    expect(kinds(sent)).toEqual(['accepted', 'response'])
    expect(sent[0].deadline).toBe(now + ACCEPT_WINDOW_MS - ACCEPT_RETURN_MS)
    expect(requests[0].headers).not.toHaveProperty('lambda-runtime-deadline-ms')
  })

  test('an acceptance AWS IoT Core refuses: a rate or quota refusal is paced, any other is refused with its code', async () => {
    const refusal = (reasonCode) =>
      Object.assign(
        new Error(
          `AWS IoT Core refused the message (reason code ${reasonCode})`,
        ),
        { reasonCode },
      )
    const codes = { quota: 0x97, rate: 0x96, denied: 0x87 }
    const { relay, requests, notRun } = setup({
      publish: (frame) => Promise.reject(refusal(codes[frame.header.id])),
    })
    for (const id of Object.keys(codes)) {
      relay.receive(topics.up, invokeFrame({ id, environment: {} }))
    }
    await settle()
    expect(requests).toHaveLength(0)
    expect(notRun).toEqual([
      { id: 'quota', functionKey: 'api', reason: 'paced' },
      { id: 'rate', functionKey: 'api', reason: 'paced' },
      { id: 'denied', functionKey: 'api', reason: 'refused', reasonCode: 0x87 },
    ])
  })

  test('an acceptance dropped after waiting for acknowledgements, or already too late, is late; only a wait for the message rate is paced', async () => {
    const { relay, requests, notRun } = setup({
      publish: (frame) => {
        frame.onDropped?.(frame.header.id)
        return false
      },
    })
    for (const id of ['rate', 'link', 'late']) {
      relay.receive(topics.up, invokeFrame({ id, environment: {} }))
    }
    await settle()
    expect(requests).toHaveLength(0)
    expect(notRun).toEqual([
      { id: 'rate', functionKey: 'api', reason: 'paced' },
      { id: 'link', functionKey: 'api', reason: 'expired' },
      { id: 'late', functionKey: 'api', reason: 'expired' },
    ])
  })

  test('nothing runs when the acceptance cannot be sent in time (paced), or its publish fails (not_sent)', async () => {
    const { relay, attempts, requests, notRun } = setup({
      publish: (frame) =>
        frame.header.id === 'late'
          ? false
          : Promise.reject(new Error('Dev Mode is not connected')),
    })
    relay.receive(topics.up, invokeFrame({ id: 'late', environment: {} }))
    relay.receive(topics.up, invokeFrame({ id: 'offline' }))
    await settle()
    expect(idKinds(attempts)).toEqual(['late:accepted', 'offline:accepted'])
    expect(requests).toHaveLength(0)
    expect(notRun).toEqual([
      { id: 'late', functionKey: 'api', reason: 'paced' },
      { id: 'offline', functionKey: 'api', reason: 'not_sent' },
    ])
  })

  test('an acceptance whose publish failed without an answer may have reached the bridge: after the reconnect the bridge is told it did not run', async () => {
    let now = 1_000_000
    let connected = false
    const refusal = Object.assign(
      new Error('AWS IoT Core refused the message (reason code 0x87)'),
      { reasonCode: 0x87 },
    )
    const { relay, sent, requests, notRun } = setup({
      now: () => now,
      publish: (frame) => {
        if (connected) return undefined
        if (frame.header.id === 'refused') return Promise.reject(refusal)
        if (frame.header.id === 'paced') return false
        return Promise.reject(new Error('the connection closed'))
      },
    })
    const offer = (id, env = 'e1') =>
      relay.receive(
        topics.up,
        invokeFrame({ id, env, environment: {}, sentAt: now - 100 }),
      )
    // Long enough before the reconnect that Lambda could be running it again, with the same
    // request id: it is not named any more.
    offer('old')
    await settle()
    now += UNSENT_ACCEPTANCE_MS - 1_000
    for (const id of ['lost', 'refused', 'paced', 'retried']) offer(id)
    offer('lost2', 'e2')
    await settle()
    expect(requests).toHaveLength(0)
    expect(notRun.map((d) => `${d.id}:${d.reason}`)).toEqual([
      'old:not_sent',
      'lost:not_sent',
      'refused:refused',
      'paced:paced',
      'retried:not_sent',
      'lost2:not_sent',
    ])
    // A new invoke with the same request id (Lambda running it again) is a request of its own.
    connected = true
    now += 1_000
    offer('retried')
    await settle()
    expect(idKinds(sent)).toEqual(['retried:accepted', 'retried:response'])
    sent.length = 0
    relay.reconnected()
    await settle()
    expect(
      sent.map((f) => `${f.topic}:${f.header.id}:${f.header.kind}`),
    ).toEqual([
      `${topics.down('e1')}:lost:expired`,
      `${topics.down('e2')}:lost2:expired`,
    ])
    // Once only.
    relay.reconnected()
    await settle()
    expect(sent).toHaveLength(2)
    expect(requests).toHaveLength(1)
  })

  test('an expired that fails to send after a reconnect is sent after the next one; one the broker refuses is not', async () => {
    const now = 1_000_000
    let mode = 'down'
    const refusal = Object.assign(
      new Error('AWS IoT Core refused the message (reason code 0x87)'),
      { reasonCode: 0x87 },
    )
    const { relay, sent, attempts } = setup({
      now: () => now,
      publish: (frame) => {
        if (mode === 'up') return undefined
        if (mode === 'refusing' && frame.header.id === 'refused') {
          return Promise.reject(refusal)
        }
        return Promise.reject(new Error('the connection closed'))
      },
    })
    for (const id of ['lost', 'refused']) {
      relay.receive(
        topics.up,
        invokeFrame({ id, env: 'e1', environment: {}, sentAt: now - 100 }),
      )
    }
    await settle()
    // The connection drops again before the expired frames are out.
    relay.reconnected()
    await settle()
    expect(sent).toHaveLength(0)
    // The broker refuses one of them on a live connection: nothing more can be done for it.
    mode = 'refusing'
    relay.reconnected()
    await settle()
    expect(
      attempts
        .filter((f) => f.header.kind === 'expired')
        .map((f) => f.header.id),
    ).toEqual(['lost', 'refused', 'lost', 'refused'])
    mode = 'up'
    relay.reconnected()
    await settle()
    expect(idKinds(sent)).toEqual(['lost:expired'])
    // Sent: not again.
    relay.reconnected()
    await settle()
    expect(idKinds(sent)).toEqual(['lost:expired'])
  })

  test('after stopAccepting every request is not_in_dev, and drain waits for what runs', async () => {
    let finish
    const { relay, sent, timers } = setup({
      invoke: () =>
        new Promise((resolve) => {
          finish = () => resolve({ kind: 'response', body: Buffer.from('1') })
        }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    relay.stopAccepting()
    relay.receive(topics.up, invokeFrame({ id: 'r2' }))
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    const drained = relay.drain(5_000)
    await settle()
    expect(relay.inFlight()).toBe(1)
    expect(timers.live()).toBe(1)
    finish()
    await drained
    expect(timers.live()).toBe(0)
    expect(relay.inFlight()).toBe(0)
    expect(idKinds(sent)).toEqual([
      'r1:accepted',
      'r2:not_in_dev',
      'r3:not_in_dev',
      'r1:response',
    ])
  })

  test('drain gives up after its time and leaves no timer behind', async () => {
    const { relay, timers } = setup({ invoke: () => new Promise(() => {}) })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    relay.stopAccepting()
    await relay.drain(30)
    expect(relay.inFlight()).toBe(1)
    expect(timers.live()).toBe(0)
  })

  test("the runtime's expired and not_in_dev mean nothing ran: the bridge is told so", async () => {
    const { relay, sent } = setup({
      invoke: (request) => ({
        kind:
          request.headers['lambda-runtime-aws-request-id'] === 'r1'
            ? 'expired'
            : 'not_in_dev',
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    relay.receive(topics.up, invokeFrame({ id: 'r2' }))
    await settle()
    expect(idKinds(sent).sort()).toEqual([
      'r1:accepted',
      'r1:expired',
      'r2:accepted',
      'r2:not_in_dev',
    ])
  })

  test('a result above one message without the deployment bucket is an error naming why', async () => {
    const { relay, sent } = setup({
      invoke: () => ({ kind: 'response', body: Buffer.alloc(200_000) }),
      sideChannel: { enabled: false, reason: 's3:PutObject was denied' },
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(sent[1].header).toMatchObject({
      kind: 'error',
      errorType: RELAY_FAILED,
    })
    expect(errorOf(sent[1])).toMatchObject({
      errorType: RELAY_FAILED,
      errorMessage: expect.stringMatching(/s3:PutObject was denied/),
    })
  })

  test('large payloads use the side channel both ways; small replies carry a spare upload URL', async () => {
    const uploads = []
    const sideChannel = {
      enabled: true,
      upload: async (body) => {
        uploads.push(body.length)
        return { key: 'out', get: 'https://get', delete: 'https://delete' }
      },
      // Signing is asynchronous: the relay waits for each upload URL.
      uploadUrl: async () => ({
        url: 'https://put',
        headers: { 'x-amz-server-side-encryption': 'aws:kms' },
        key: 'spare',
        ttlMs: 900_000,
      }),
      download: async (s3) => Buffer.from(JSON.stringify({ from: s3.key })),
    }
    const { relay, sent, requests } = setup({
      sideChannel,
      invoke: (request) => ({
        kind: 'response',
        body: request.event.toString().includes('in-1')
          ? Buffer.alloc(200_000)
          : Buffer.from('1'),
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(sent[1].header.upload).toMatchObject({ key: 'spare' })
    relay.receive(
      topics.up,
      invokeFrame(
        { id: 'r2', s3: { key: 'in-1', versionId: 'v1' } },
        Buffer.alloc(0),
      ),
    )
    await settle()
    expect(requests[1].event.toString()).toBe('{"from":"in-1"}')
    expect(sent[sent.length - 1].header).toMatchObject({
      kind: 'response',
      id: 'r2',
      s3: { key: 'out', get: 'https://get', delete: 'https://delete' },
      upload: { key: 'spare' },
    })
    expect(sent[sent.length - 1].body).toHaveLength(0)
    expect(uploads).toEqual([200_000])
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    await settle()
    expect(sent[sent.length - 1]).toMatchObject({
      topic: topics.down('e1'),
      header: { kind: 'upload_url', id: 'r3', upload: { key: 'spare' } },
    })
  })

  test('an upload URL that cannot be signed leaves replies without one and answers its request not_in_dev', async () => {
    const { relay, sent, lines } = setup({
      sideChannel: {
        enabled: true,
        upload: async () => ({ key: 'out', get: 'g', delete: 'd' }),
        uploadUrl: async () => {
          throw new Error(
            'signing https://b.s3.amazonaws.com/k?X-Amz-Signature=abc failed',
          )
        },
        download: async () => Buffer.alloc(0),
      },
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(sent[1].header).toMatchObject({ kind: 'response', id: 'r1' })
    expect(sent[1].header.upload).toBeUndefined()
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    await settle()
    expect(sent[sent.length - 1].header).toEqual({
      kind: 'not_in_dev',
      id: 'r3',
    })
    expect(lines.join('\n')).toMatch(/could not sign an upload URL/)
    expect(lines.join('\n')).not.toMatch(/X-Amz-|https:\/\//)
  })

  test('an upload URL signed while the relay begins to stop is not sent: the request is not_in_dev', async () => {
    let signed
    const { relay, sent } = setup({
      sideChannel: {
        enabled: true,
        upload: async () => ({ key: 'out', get: 'g', delete: 'd' }),
        uploadUrl: () =>
          new Promise((resolve) => {
            signed = () =>
              resolve({ url: 'https://put', headers: {}, key: 'k', ttlMs: 1 })
          }),
        download: async () => Buffer.alloc(0),
      },
    })
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    await settle()
    relay.stopAccepting()
    signed()
    await settle()
    expect(idKinds(sent)).toEqual(['r3:not_in_dev'])
  })

  test('without the side channel an upload URL request is not_in_dev at once', async () => {
    const { relay, sent } = setup({
      sideChannel: { enabled: false, reason: 'the bucket requires SSE-C' },
    })
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: KIND.UPLOAD_URL_REQUEST, env: 'e1', id: 'r3' }),
    )
    await settle()
    expect(idKinds(sent)).toEqual(['r3:not_in_dev'])
  })

  test('a failure after acceptance answers Runtime.DevModeRelayFailed naming the cause without its URL', async () => {
    const { relay, sent } = setup({
      invoke: (request) => ({
        kind: 'response',
        body: Buffer.alloc(
          request.headers['lambda-runtime-aws-request-id'] === 'r1'
            ? 200_000
            : 1,
        ),
      }),
      sideChannel: {
        enabled: true,
        upload: async () => {
          throw new Error(
            'PUT https://bucket.s3.amazonaws.com/k?X-Amz-Signature=abc failed with 403',
          )
        },
        uploadUrl: () => undefined,
        download: async () => {
          throw new Error(
            'GET https://bucket.s3.amazonaws.com/in?X-Amz-Signature=def failed with 404',
          )
        },
      },
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    relay.receive(
      topics.up,
      invokeFrame(
        { id: 'r2', s3: { key: 'in', versionId: 'v' } },
        Buffer.alloc(0),
      ),
    )
    await settle()
    expect(idKinds(sent).sort()).toEqual([
      'r1:accepted',
      'r1:error',
      'r2:accepted',
      'r2:error',
    ])
    for (const frame of sent.filter((f) => f.header.kind === 'error')) {
      expect(frame.header.errorType).toBe(RELAY_FAILED)
      const { errorMessage } = errorOf(frame)
      expect(errorMessage).toMatch(/403|404/)
      expect(errorMessage).not.toMatch(/https?:|X-Amz/)
    }
  })

  test('a result whose publish fails is followed by Runtime.DevModeRelayFailed', async () => {
    const { relay, sent } = setup({
      publish: (frame) =>
        frame.header.kind === 'response'
          ? Promise.reject(new Error('AWS IoT Core refused the message'))
          : undefined,
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    expect(kinds(sent)).toEqual(['accepted', 'error'])
    expect(sent[1].header.errorType).toBe(RELAY_FAILED)
    expect(errorOf(sent[1]).errorMessage).toMatch(/refused the message/)
  })

  test('a stream goes out as start, coalesced data frames of at most 100 KiB, and an end with its trailers', async () => {
    const body = new PassThrough()
    let end
    const ended = new Promise((resolve) => {
      end = resolve
    })
    const { relay, sent } = setup({
      invoke: () => ({
        kind: 'stream',
        contentType: 'text/plain',
        body,
        ended,
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    for (let i = 0; i < 50; i++) body.write('x')
    // The small writes go out together once the coalescing timer fires.
    await waitFor(() => kinds(sent).includes('stream_data'))
    body.write(Buffer.alloc(150 * 1024))
    body.end('tail')
    end({ errorType: 'Error', errorBody: 'e30=' })
    await settle()
    await settle()
    expect(kinds(sent).slice(0, 2)).toEqual(['accepted', 'stream_start'])
    expect(sent[1].header.contentType).toBe('text/plain')
    const data = sent.filter((f) => f.header.kind === 'stream_data')
    expect(data[0].body.toString()).toBe('x'.repeat(50))
    expect(data.every((f) => f.body.length <= STREAM_CHUNK_BYTES)).toBe(true)
    expect(data.reduce((n, f) => n + f.body.length, 0)).toBe(
      50 + 150 * 1024 + 4,
    )
    expect(data.map((f) => f.header.n)).toEqual(data.map((_, i) => i))
    expect(data.every((f) => f.priority === 'data')).toBe(true)
    const last = sent[sent.length - 1]
    expect(last.header).toMatchObject({
      kind: 'stream_end',
      count: data.length,
      errorType: 'Error',
      errorBody: 'e30=',
    })
  })

  test.each([
    ['without', false],
    ['with', true],
  ])(
    'one handler write larger than 6 MB is split %s the side channel: inline frames stay within one chunk, objects well within what the bridge downloads',
    async (_, enabled) => {
      const maxObjectBytes = goMaxObjectBytes()
      const objects = []
      const body = new PassThrough()
      const total = 6_500_000
      const { relay, sent } = setup({
        sideChannel: enabled
          ? {
              enabled: true,
              upload: async (piece) => {
                objects.push(piece)
                return {
                  key: `o${objects.length}`,
                  get: 'https://get',
                  delete: 'https://delete',
                }
              },
              uploadUrl: () => undefined,
              download: async () => Buffer.alloc(0),
            }
          : { enabled: false, reason: 'not set up' },
        invoke: () => ({
          kind: 'stream',
          contentType: 'application/octet-stream',
          body,
          ended: new Promise((resolve) => body.on('end', () => resolve({}))),
        }),
      })
      relay.receive(topics.up, invokeFrame({ environment: {} }))
      await settle()
      body.end(Buffer.alloc(total, 7))
      await waitFor(() => kinds(sent).includes('stream_end'))
      const data = sent.filter((f) => f.header.kind === 'stream_data')
      expect(data.map((f) => f.header.n)).toEqual(data.map((_, i) => i))
      expect(data.every((f) => f.body.length <= STREAM_CHUNK_BYTES)).toBe(true)
      const inline = data.reduce((n, f) => n + f.body.length, 0)
      const viaS3 = objects.reduce((n, piece) => n + piece.length, 0)
      expect(inline + viaS3).toBe(total)
      expect(sent[sent.length - 1].header).toEqual({
        kind: 'stream_end',
        id: 'r1',
        count: data.length,
      })
      if (enabled) {
        expect(objects.length).toBeGreaterThan(1)
        expect(data.filter((f) => f.header.s3)).toHaveLength(objects.length)
        for (const piece of objects) {
          expect(piece.length).toBeLessThanOrEqual(STREAM_OBJECT_BYTES)
          // The sealed object: the payload header, a newline, the piece and the frame overhead.
          expect(piece.length + 64 + FRAME_OVERHEAD_BYTES).toBeLessThan(
            maxObjectBytes - 32 * 1024,
          )
        }
      } else {
        expect(objects).toEqual([])
        expect(data).toHaveLength(Math.ceil(total / STREAM_CHUNK_BYTES))
      }
    },
  )

  test('a stream that fails after it started ends with Runtime.DevModeRelayFailed in its trailers', async () => {
    const body = new PassThrough()
    const { relay, sent } = setup({
      invoke: () => ({
        kind: 'stream',
        contentType: 'text/plain',
        body,
        ended: new Promise(() => {}),
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    body.write('a')
    await settle()
    body.destroy(new Error('the local worker went away'))
    await settle()
    const last = sent[sent.length - 1]
    expect(last.header).toMatchObject({
      kind: 'stream_end',
      errorType: RELAY_FAILED,
    })
    expect(trailerOf(last)).toMatchObject({
      errorType: RELAY_FAILED,
      errorMessage: expect.stringMatching(/the local worker went away/),
    })
  })

  test('a stream data frame whose publish fails ends the stream with Runtime.DevModeRelayFailed and keeps reading the handler', async () => {
    const body = new PassThrough()
    let ended
    const { relay, sent } = setup({
      // Each data frame waits for its acknowledgement a moment, so the handler's stream is paused
      // with frames queued when the second one fails.
      publish: async (frame) => {
        if (frame.header.kind !== 'stream_data') return undefined
        // The second frame fails after the ones behind it were sent.
        await settle(frame.header.n === 1 ? 60 : 20)
        if (frame.header.n === 1) {
          throw new Error('the connection to AWS IoT Core ended')
        }
        return undefined
      },
      invoke: () => ({
        kind: 'stream',
        contentType: 'text/plain',
        body,
        ended: new Promise((resolve) => {
          ended = resolve
        }),
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    body.write(Buffer.alloc(60 * STREAM_CHUNK_BYTES, 1))
    // Backpressure: the handler's stream is paused while frames wait. waitFor checks at once,
    // before any timer runs, so the second frame's failure cannot have resumed it yet, however
    // long the write took.
    await waitFor(() => body.isPaused(), 2_000)
    await waitFor(() => kinds(sent).includes('stream_end'))
    // Data frames already in flight may still land after it; the bridge orders them.
    const last = sent.find((f) => f.header.kind === 'stream_end')
    // Only the frame before the one that failed counts.
    expect(last.header).toMatchObject({
      kind: 'stream_end',
      count: 1,
      errorType: RELAY_FAILED,
    })
    expect(body.isPaused()).toBe(false)
    expect(trailerOf(last).errorMessage).toMatch(/AWS IoT Core ended/)
    // The handler is never blocked by a stream nobody sends: what it still writes is read.
    expect(await readToTheEnd(body)).toBe(true)
    ended({})
    await settle()
    expect(kinds(sent).filter((k) => k === 'stream_end')).toHaveLength(1)
  })

  test('a stream whose start may not have reached the bridge is answered both ways', async () => {
    const body = new PassThrough()
    const { relay, sent } = setup({
      publish: (frame) =>
        frame.header.kind === 'stream_start'
          ? Promise.reject(new Error('the connection to AWS IoT Core ended'))
          : undefined,
      invoke: () => ({
        kind: 'stream',
        contentType: 'text/plain',
        body,
        ended: new Promise(() => {}),
      }),
    })
    relay.receive(topics.up, invokeFrame({ environment: {} }))
    await settle()
    // A bridge that has the start takes the end's trailers; one that does not takes the error.
    expect(idKinds(sent)).toEqual(['r1:accepted', 'r1:stream_end', 'r1:error'])
    expect(sent[1].header).toMatchObject({ count: 0, errorType: RELAY_FAILED })
    expect(sent[2].header.errorType).toBe(RELAY_FAILED)
    expect(errorOf(sent[2]).errorMessage).toMatch(/start of its stream/)
    // The handler's stream is still read.
    expect(await readToTheEnd(body)).toBe(true)
  })

  test('frames on other topics, sealed with another key, of unknown kinds, and pings are ignored', async () => {
    const { relay, sent, requests } = setup()
    relay.receive(topics.gone, invokeFrame({ environment: {} }))
    relay.receive(
      topics.up,
      createSealer({ key: Buffer.alloc(32, 9) })(topics.up, {
        kind: KIND.INVOKE,
      }),
    )
    relay.receive(
      topics.up,
      bridge(topics.up, { kind: 'something_new', id: 'x' }),
    )
    relay.receive(topics.up, Buffer.from('not a frame'))
    // The bridges' Direct Messaging liveness questions: empty, on the session's ping topic.
    relay.receive(topics.ping, Buffer.alloc(0))
    relay.receive(topics.ping, undefined)
    relay.receive(topics.up, Buffer.alloc(0))
    relay.receive('sls-dev/s_other/up', invokeFrame({ environment: {} }))
    // An invoke without a usable environment id or request id is not answered.
    relay.receive(topics.up, invokeFrame({ env: 'e/1', environment: {} }))
    relay.receive(topics.up, invokeFrame({ id: 7, environment: {} }))
    await settle()
    expect(sent).toHaveLength(0)
    expect(requests).toHaveLength(0)
    // Only the frames on the session's topic that did not open are counted.
    expect(relay.droppedFrames()).toBe(2)
  })

  test('an invoke replayed minutes later, right after a reconnect, runs nothing; a genuine one after the reconnect runs', async () => {
    let now = 50_000_000
    const { relay, sent, requests, notRun } = setup({ now: () => now })
    // A genuine invoke, captured on its way by someone with the broker's topics but not the key.
    const captured = invokeFrame({
      id: 'r0',
      environment: {},
      sentAt: now - 120,
    })
    const seen = invokeFrame({ id: 'r1', environment: {}, sentAt: now - 120 })
    relay.receive(topics.up, seen)
    await settle()
    // 9 minutes later, this machine reconnects; the captured invoke arrives first, then the
    // bridge's own next one, offered moments ago.
    now += 9 * 60_000
    relay.reconnected()
    relay.receive(topics.up, captured)
    relay.receive(
      topics.up,
      invokeFrame({ id: 'r2', environment: {}, sentAt: now - 150 }),
    )
    await settle()
    expect(idKinds(sent)).toEqual([
      'r1:accepted',
      'r1:response',
      'r0:expired',
      'r2:accepted',
      'r2:response',
    ])
    expect(
      requests.map((r) => r.headers['lambda-runtime-aws-request-id']),
    ).toEqual(['r1', 'r2'])
    expect(notRun).toEqual([
      { id: 'r0', functionKey: 'api', reason: 'stale', staleInARow: 1 },
    ])
    expect(relay.staleFrames()).toBe(1)
  })

  test('requests refused as too old are counted apart from late ones, with how many came in a row', async () => {
    let now = 70_000_000
    const { relay, sent, notRun } = setup({ now: () => now })
    const offer = (id, sentAt) =>
      relay.receive(topics.up, invokeFrame({ id, environment: {}, sentAt }))
    offer('fresh', now - 100)
    await settle()
    // This machine's clock jumped two minutes ahead: every request now looks two minutes old.
    now += 120_000
    offer('old1', now - 120_100)
    offer('old2', now - 120_100)
    await settle()
    // An unstamped request is refused too, but says nothing about the clock.
    relay.receive(
      topics.up,
      invokeFrame({ id: 'unstamped', environment: {}, sentAt: undefined }),
    )
    await settle()
    now -= 120_000
    offer('fresh2', now - 100)
    await settle()
    now += 120_000
    offer('old3', now - 120_100)
    await settle()
    expect(idKinds(sent)).toEqual([
      'fresh:accepted',
      'fresh:response',
      'old1:expired',
      'old2:expired',
      'unstamped:expired',
      'fresh2:accepted',
      'fresh2:response',
      'old3:expired',
    ])
    expect(notRun).toEqual([
      { id: 'old1', functionKey: 'api', reason: 'stale', staleInARow: 1 },
      { id: 'old2', functionKey: 'api', reason: 'stale', staleInARow: 2 },
      { id: 'unstamped', functionKey: 'api', reason: 'stale', staleInARow: 2 },
      { id: 'old3', functionKey: 'api', reason: 'stale', staleInARow: 1 },
    ])
    expect(relay.staleFrames()).toBe(4)
  })

  test.each([22_000, 6_000])(
    'a first invoke delivered %i ms late, as after a frozen machine wakes up, is refused and never runs; a fresh one runs',
    async (late) => {
      let now = 1_000_000
      const { relay, sent, requests, notRun } = setup({ now: () => now })
      relay.receive(
        topics.up,
        invokeFrame({ id: 'queued', environment: {}, sentAt: now - late }),
      )
      await settle()
      now += 2_000
      relay.receive(
        topics.up,
        invokeFrame({ id: 'fresh', environment: {}, sentAt: now - 300 }),
      )
      await settle()
      expect(idKinds(sent)).toEqual([
        'queued:expired',
        'fresh:accepted',
        'fresh:response',
      ])
      expect(
        requests.map((r) => r.headers['lambda-runtime-aws-request-id']),
      ).toEqual(['fresh'])
      expect(notRun).toEqual([
        { id: 'queued', functionKey: 'api', reason: 'expired' },
      ])
    },
  )

  test('the first invoke of a session sent longer ago than any clock difference allows is refused', async () => {
    const { relay, sent, requests } = setup()
    relay.receive(
      topics.up,
      invokeFrame({
        environment: {},
        sentAt: Date.now() - ACCEPT_WINDOW_MS - MAX_CLOCK_SKEW_MS - 60_000,
      }),
    )
    await settle()
    expect(idKinds(sent)).toEqual(['r1:expired'])
    expect(requests).toHaveLength(0)
  })

  test('an invoke without sentAt cannot be judged: it is refused and runs nothing', async () => {
    const { relay, sent, requests } = setup()
    relay.receive(
      topics.up,
      invokeFrame({ environment: {}, sentAt: undefined }),
    )
    relay.receive(topics.up, invokeFrame({ id: 'r2', sentAt: '1' }))
    await settle()
    expect(idKinds(sent)).toEqual(['r1:expired', 'r2:expired'])
    expect(requests).toHaveLength(0)
  })

  test('presigned query parameters are removed from error text in every form, as the bridge removes them', () => {
    for (const text of [
      'GET /mqtt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Security-Token=tok3n failed',
      'host/k?X-Amz-Signature=e8df4926f8cbb2d1 refused',
      'handshake: X-Amz-Date=20130524T000000Z X-Amz-Security-Token=tok3n, status 403',
      'upload /k?x-amz-security-token=tok3n: bad status',
      'path%3FX-Amz-Security-Token%3Dtok3n%26X-Amz-Signature%3De8df4926f8cbb2d1 failed',
      'https://bucket.s3.amazonaws.com/k?X-Amz-Security-Token=tok%2Fen%2B%3D',
      '{"X-Amz-Signature":"e8df4926f8cbb2d1"}',
      '{"X-Amz-Security-Token": "tok3n/a+b=c%2Fd", "status": 403}',
      "X-Amz-Signature='e8df4926=f8/cb+b2%2Fd1' rejected",
      'X-Amz-Security-Token="tok3n=a/b+c%2Fd" rejected',
      'X-Amz-Security-Token = "tok3n" rejected',
      "header X-Amz-Security-Token: 'tok3n/a+b=' rejected",
      'X-Amz-Date: 20130524T000000Z, status 403',
      'X-Amz-Security-Token: tok3n/a+b= rejected',
      'double%253FX-Amz-Security-Token%253Dtok3n%2526x failed',
    ]) {
      const got = withoutSecrets(text)
      for (const banned of [
        'X-Amz-',
        'x-amz-',
        'tok3n',
        'tok%2F',
        'ASIAEXAMPLE',
        'e8df4926',
        'AWS4-HMAC',
        '20130524',
        'a/b+',
        'f8/cb',
        'https://',
      ]) {
        expect(got.includes(banned) ? `${text} -> ${got}` : null).toBeNull()
      }
    }
    expect(withoutSecrets('GET /k?X-Amz-Security-Token=tok3n failed')).toBe(
      'GET /k?<redacted> failed',
    )
    expect(
      withoutSecrets('{"X-Amz-Signature":"e8df","X-Amz-Date":"20130524"}'),
    ).toBe('{<redacted>,<redacted>}')
    // A header named in prose keeps the words after it.
    for (const prose of [
      'missing header X-Amz-Date: the request was rejected',
      'missing X-Amz-Security-Token header',
      'X-Amz-Security-Token: expired',
    ]) {
      expect(withoutSecrets(prose)).toBe(prose)
    }
  })

  test('the role credentials in a forwarded environment are never logged', async () => {
    const { relay, lines } = setup({
      invoke: () => {
        throw new Error('the runtime broke')
      },
    })
    relay.receive(topics.up, invokeFrame({ environment: ROLE }))
    relay.receive(topics.up, Buffer.from('not a frame'))
    await settle()
    expect(lines.length).toBeGreaterThan(0)
    // The afterEach checks every line for each secret.
  })

  test("the acceptance window and margins are the bridge's", () => {
    const source = fs.readFileSync(path.join(BRIDGE, 'relay.go'), 'utf8')
    const defaults = source.match(/func Defaults\(\) Timing \{([\s\S]*?)\n\}/)
    expect(defaults).not.toBeNull()
    const durationOf = (field) => {
      const found = defaults[1].match(
        new RegExp(
          `\\b${field}:\\s*(?:(\\d+)\\s*\\*\\s*)?time\\.(Second|Millisecond)\\b`,
        ),
      )
      expect(found).not.toBeNull()
      return Number(found[1] ?? 1) * (found[2] === 'Second' ? 1_000 : 1)
    }
    expect(ACCEPT_WINDOW_MS).toBe(durationOf('AcceptWindow'))
    expect(ACCEPT_MARGIN_MS).toBe(durationOf('MinRemaining'))
    // The bridge offers no window shorter than MinAcceptWindow; this machine refuses any window
    // that leaves less than ACCEPT_RETURN_MS, so it never accepts in one the bridge would not offer.
    expect(ACCEPT_RETURN_MS).toBeGreaterThanOrEqual(
      durationOf('MinAcceptWindow'),
    )
  })

  test('a relayed request runs in a real handler process and its result comes back', async () => {
    const serviceDir = write(tempDir(), {
      'handler.mjs': [
        "import { createHash } from 'crypto'",
        'export const handler = async (event) => {',
        '  const response = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {',
        '    headers: { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN },',
        '  })',
        '  const { AccessKeyId } = await response.json()',
        '  return {',
        '    echo: event,',
        '    root: process.env.LAMBDA_TASK_ROOT,',
        '    region: process.env.AWS_REGION,',
        '    proxy: process.env.HTTPS_PROXY ?? null,',
        "    staticKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].filter(",
        '      (name) => name in process.env,',
        '    ),',
        "    endpointKey: createHash('sha256').update(AccessKeyId).digest('hex'),",
        '  }',
        '}',
        '',
      ].join('\n'),
    })
    const runtimeTimers = countingTimers()
    const runtime = createLocalRuntime({
      serverless: { pluginManager: { plugins: [] } },
      serviceDir,
      functions: new Map([
        [
          'api',
          {
            key: 'api',
            adapter: nodeAdapter,
            local: {
              available: true,
              command: process.execPath,
              version: process.versions.node,
            },
            runtime: 'nodejs24.x',
            timeout: 6,
            config: { handler: 'handler.handler' },
            deployedVariables: { HTTPS_PROXY: 'http://10.0.0.5:3128' },
            lambdaValues: { AWS_REGION: 'us-east-1' },
          },
        ],
      ]),
      output: { start() {}, log() {}, end() {}, workerExited() {} },
      logger: { debug() {}, warning() {}, notice() {} },
      timers: runtimeTimers,
      processRef: new EventEmitter(),
      machineEnv: { ...baseEnv(), HOME: serviceDir },
      tmpRoot: tempDir('sls-dev-tmp-'),
    })
    await runtime.start()
    try {
      const { relay, sent } = setup({ runtime })
      const event = { hello: 'world', n: 1 }
      relay.receive(
        topics.up,
        invokeFrame(
          {
            remainingMs: 30_000,
            environment: {
              AWS_REGION: 'us-east-1',
              ...ROLE,
              HTTPS_PROXY: 'http://10.0.0.5:3128',
            },
          },
          Buffer.from(JSON.stringify(event)),
        ),
      )
      await waitFor(() => sent.length >= 2, 30_000)
      expect(kinds(sent)).toEqual(['accepted', 'response'])
      const result = JSON.parse(sent[1].body.toString('utf8'))
      expect(result).toEqual({
        echo: event,
        root: fs.realpathSync(serviceDir),
        region: 'us-east-1',
        proxy: null,
        staticKeys: [],
        // The function role's key, served only by the loopback credentials endpoint.
        endpointKey: createHash('sha256')
          .update(ROLE.AWS_ACCESS_KEY_ID)
          .digest('hex'),
      })
    } finally {
      await runtime.stop()
      expect(runtimeTimers.live()).toBe(0)
    }
  })
})

const goMaxObjectBytes = () => {
  const source = fs.readFileSync(path.join(BRIDGE, 's3.go'), 'utf8')
  const found = source.match(/const MaxObjectBytes = ([\d\s*+]+)\n/)
  expect(found).not.toBeNull()
  return found[1]
    .split('+')
    .map((term) =>
      term
        .split('*')
        .map((factor) => Number(factor.trim()))
        .reduce((a, b) => a * b, 1),
    )
    .reduce((a, b) => a + b, 0)
}

test("stream objects leave room under the bridge's largest S3 download", () => {
  const max = goMaxObjectBytes()
  expect(max).toBe(6 * 1024 * 1024 + 64 * 1024)
  expect(STREAM_OBJECT_BYTES).toBeLessThanOrEqual(max - 1024 * 1024)
  expect(STREAM_OBJECT_BYTES).toBeGreaterThan(STREAM_CHUNK_BYTES)
})

describe('messages only the session key vouches for', () => {
  // Any code that holds the session key can publish on the session's up topic.
  const TWO = new Map([
    ['svc-dev-api', 'api'],
    ['svc-dev-worker', 'worker'],
  ])

  test("an execution environment of one function is never another function's", async () => {
    const { relay, sent, requests, lines } = setup({ functions: TWO })
    relay.receive(topics.up, invokeFrame({ environment: { A: '1' } }))
    await settle()
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'r2',
        fn: 'svc-dev-worker',
        environment: { AWS_ACCESS_KEY_ID: 'ASIAFORGED' },
      }),
    )
    await settle()
    expect(requests.map((r) => r.functionKey)).toEqual(['api'])
    // Nothing is answered: the environment's bridge did not send it.
    expect(idKinds(sent)).toEqual(['r1:accepted', 'r1:response'])
    expect(lines).toContain(
      'Dev Mode ignored r2: its execution environment e1 runs another function',
    )
    // The function's own next request still runs with what its bridge sent.
    relay.receive(topics.up, invokeFrame({ id: 'r3' }))
    await settle()
    expect(requests[1]).toMatchObject({
      functionKey: 'api',
      environment: { A: '1' },
    })
  })

  test('the variables an execution environment sent first are kept', async () => {
    const { relay, requests, lines } = setup()
    relay.receive(topics.up, invokeFrame({ environment: { A: '1' } }))
    await settle()
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'r2',
        environment: { A: '1', AWS_ACCESS_KEY_ID: 'ASIAFORGED' },
      }),
    )
    await settle()
    expect(requests.map((r) => r.environment)).toEqual([{ A: '1' }, { A: '1' }])
    expect(lines).toContain(
      'Dev Mode kept the variables execution environment e1 of api sent first: r2 brought others',
    )
    // The same variables again (a bridge that reconnected) are no news.
    relay.receive(topics.up, invokeFrame({ id: 'r3', environment: { A: '1' } }))
    await settle()
    expect(lines.filter((line) => line.includes('r3'))).toEqual([])
  })

  test("the environment replays run in is never a bridge's", async () => {
    const { relay, sent, requests, lines } = setup()
    relay.receive(
      topics.up,
      invokeFrame({ env: 'dev-replay', environment: { A: '1' } }),
    )
    await settle()
    expect(requests).toEqual([])
    expect(sent).toEqual([])
    expect(lines).toContain(
      'Dev Mode ignored r1: its execution environment dev-replay is the one replays run in',
    )
  })

  test('a stale request binds its execution environment too, so the expired answer reveals nothing to take over', async () => {
    const { relay, requests, lines } = setup({ functions: TWO })
    // Too old to run (a replay): answered expired on down/e1, which anyone with the key reads.
    relay.receive(
      topics.up,
      invokeFrame({ sentAt: undefined, environment: { A: '1' } }),
    )
    await settle()
    expect(requests).toEqual([])
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'r2',
        fn: 'svc-dev-worker',
        environment: { AWS_ACCESS_KEY_ID: 'ASIAFORGED' },
      }),
    )
    relay.receive(
      topics.up,
      invokeFrame({
        id: 'r3',
        environment: { AWS_ACCESS_KEY_ID: 'ASIAFORGED' },
      }),
    )
    await settle()
    expect(lines).toContain(
      'Dev Mode ignored r2: its execution environment e1 runs another function',
    )
    expect(requests.map((r) => [r.functionKey, r.environment])).toEqual([
      ['api', { A: '1' }],
    ])
  })

  test('an execution environment in use keeps its place: the one idle the longest is forgotten first', async () => {
    const { relay, sent, requests } = setup({ rememberedEnvironments: 3 })
    const offer = (env, id, environment) =>
      relay.receive(topics.up, invokeFrame({ env, id, environment }))
    offer('e1', 'a1', { E: '1' })
    await settle()
    offer('e2', 'a2', { E: '2' })
    offer('e3', 'a3', { E: '3' })
    await settle()
    // e1 runs again: it is now the most recent.
    offer('e1', 'b1')
    await settle()
    // A fourth environment makes room: e2, idle the longest, goes; e1 stays.
    offer('e4', 'a4', { E: '4' })
    await settle()
    offer('e1', 'c1')
    offer('e2', 'c2')
    await settle()
    expect(
      requests
        .filter((r) =>
          ['b1', 'c1'].includes(r.headers['lambda-runtime-aws-request-id']),
        )
        .map((r) => r.environment),
    ).toEqual([{ E: '1' }, { E: '1' }])
    expect(idKinds(sent)).toContain('c2:need_environment')
  })
})

describe('counts of invocations that ran the deployed code while this session could not be reached', () => {
  const countFrame = (body, header = {}) =>
    bridge(
      topics.up,
      { kind: KIND.PASSED, env: 'e1', ...header },
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    )
  const offline = (n, fn = 'svc-dev-api') => ({
    since: 1_790_000_000_000,
    counts: [{ fn, reason: 'offline', n }],
  })

  // `receive` handles a count synchronously, so each test checks right after it returns.
  test('each count of a function in this session is passed on once, and nothing is answered', () => {
    const { relay, passed, attempts } = setup()
    const frame = countFrame(offline(3))
    relay.receive(topics.up, frame)
    // AWS IoT Core delivers a QoS 1 message twice now and then: the copy is dropped.
    relay.receive(topics.up, frame)
    expect(passed).toEqual([
      {
        functionKey: 'api',
        count: 3,
        since: 1_790_000_000_000,
        environmentId: 'e1',
      },
    ])
    expect(attempts).toEqual([])
  })

  test.each([
    ['a function not in this session', offline(1, 'svc-dev-other')],
    [
      'another reason',
      { since: 1, counts: [{ fn: 'svc-dev-api', reason: 'late', n: 1 }] },
    ],
    ['a count that is not an integer', offline(1.5)],
    ['a count of zero', offline(0)],
    ['a count no bridge could have reached', offline(2_000_000)],
    ['no counts', { since: 1 }],
  ])('%s is ignored', (_name, body) => {
    const { relay, passed } = setup()
    relay.receive(topics.up, countFrame(body))
    expect(passed).toEqual([])
  })

  test('a frame passes on at most 16 counts: more than one bridge reports', () => {
    const { relay, passed } = setup()
    relay.receive(
      topics.up,
      countFrame({
        since: 1_790_000_000_000,
        counts: Array.from({ length: 40 }, () => ({
          fn: 'svc-dev-api',
          reason: 'offline',
          n: 1,
        })),
      }),
    )
    expect(passed).toHaveLength(16)
  })

  test('a body that is not JSON is ignored with a debug line', () => {
    const { relay, passed, lines } = setup()
    relay.receive(topics.up, countFrame('not json'))
    expect(passed).toEqual([])
    expect(lines.join('\n')).toContain('a count of invocations')
  })

  test('a count without a time it began passes on null', () => {
    const { relay, passed } = setup()
    relay.receive(
      topics.up,
      countFrame({ counts: [{ fn: 'svc-dev-api', reason: 'offline', n: 1 }] }),
    )
    expect(passed).toEqual([
      { functionKey: 'api', count: 1, since: null, environmentId: 'e1' },
    ])
  })

  test('a count on another topic, or once stopping, is ignored', () => {
    const { relay, passed } = setup()
    relay.receive(
      topics.gone,
      bridge(
        topics.gone,
        { kind: KIND.PASSED, env: 'e1' },
        Buffer.from(JSON.stringify(offline(1))),
      ),
    )
    relay.stopAccepting()
    relay.receive(topics.up, countFrame(offline(1)))
    expect(passed).toEqual([])
  })
})
