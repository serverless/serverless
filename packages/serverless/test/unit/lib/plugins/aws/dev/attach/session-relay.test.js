import { describe, expect, test } from '@jest/globals'
import {
  DRAIN_MS,
  LIVENESS_WAIT_MS,
  SWEEP_MS,
  checkSessions,
  createSessionLiveness,
  openRelayRun,
  startRelayConnection,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-relay.js'
import { createCredentialCache } from '../../../../../../../lib/plugins/aws/dev/relay/credentials.js'
import {
  AWAY_WINDOW_MS,
  awayLine,
  clockOffLine,
  lateLine,
  livenessDeniedLine,
  refusedLine,
  livenessUnansweredLine,
  sideChannelOffLine,
  throughputLine,
  workersBusyLine,
} from '../../../../../../../lib/plugins/aws/dev/relay/messages.js'
import { countingTimers } from './fakes.js'
import { manualClock } from '../relay/manual-clock.js'
import {
  KIND,
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'

const key = Buffer.alloc(32, 4)
const waitFor = async (check, ms = 5_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const recordingLogger = () => {
  const lines = []
  return {
    lines,
    notice: (text) => lines.push(['notice', text]),
    warning: (text) => lines.push(['warning', text]),
    debug: (text) => lines.push(['debug', text]),
  }
}

/** A transport stand-in that records how it was built and lets the test drive its events. */
const fakeTransportFactory = ({ fail } = {}) => {
  const made = {}
  const connectTransport = (options) => {
    made.options = options
    return {
      clientId: 'sls-dev-s_1-cli',
      start: async () => {
        if (fail) throw fail
      },
      publish: async () => true,
      stop: async () => {
        made.stopped = (made.stopped ?? 0) + 1
      },
    }
  }
  return { made, connectTransport }
}

const start = (extra = {}) =>
  startRelayConnection({
    region: 'us-east-1',
    iotEndpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
    sessionId: 's_0123456789ab',
    sessionKey: key,
    resolveCredentials: async () => ({
      accessKeyId: 'AKID',
      secretAccessKey: 's',
    }),
    credentialSource: { source: 'profile', profile: 'dev-sso' },
    timers: { setTimeout, clearTimeout, setInterval, clearInterval },
    ...extra,
  })

describe("the session's relay connection", () => {
  test('connects to the session with a sealed goodbye as its will, and routes messages to the receiver', async () => {
    const logger = recordingLogger()
    const { made, connectTransport } = fakeTransportFactory()
    const now = () => 1_000
    const connection = await start({ logger, connectTransport, now })
    expect(made.options).toMatchObject({
      endpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
      region: 'us-east-1',
      sessionId: 's_0123456789ab',
      // For the advice when the credentials cannot be read.
      credentialSource: { source: 'profile', profile: 'dev-sso' },
    })
    // The relay and the transport's pacer share one clock: deadlines cross between them.
    expect(made.options.now).toBe(now)
    const gone = createOpener({ key })(
      topicsOf('s_0123456789ab').gone,
      made.options.goneFrame(),
    )
    expect(gone.header).toEqual({ kind: 'gone' })
    expect(await made.options.credentials()).toEqual({
      accessKeyId: 'AKID',
      secretAccessKey: 's',
    })
    expect(connection.credentials.current().accessKeyId).toBe('AKID')
    const seen = []
    connection.setReceiver((topic, payload) =>
      seen.push([topic, payload.toString()]),
    )
    made.options.onMessage('sls-dev/s_0123456789ab/up', Buffer.from('x'))
    expect(seen).toEqual([['sls-dev/s_0123456789ab/up', 'x']])
    await connection.stop()
    await connection.stop()
    expect(made.stopped).toBe(1)
  })

  test('prints the lost, reconnected and credentials lines, and tells the relay of every reconnect', async () => {
    const logger = recordingLogger()
    const { made, connectTransport } = fakeTransportFactory()
    const connection = await start({ logger, connectTransport })
    let reconnects = 0
    connection.onReconnected(() => {
      reconnects += 1
    })
    made.options.onState({ state: 'lost', reason: 'the connection closed' })
    made.options.onState({ state: 'reconnected', offlineMs: 4_000 })
    made.options.onState({
      state: 'credentials_expired',
      error: new Error('expired'),
    })
    made.options.onState({ state: 'credentials_refreshed' })
    expect(logger.lines.map(([level, text]) => `${level}: ${text}`)).toEqual([
      'warning: Dev Mode lost its connection to AWS IoT Core (the connection closed). Invocations run the deployed code until this machine reconnects.',
      'notice: Dev Mode reconnected to AWS IoT Core after 4 s offline.',
      'warning: Your AWS credentials expired, so Dev Mode cannot reconnect and invocations run the deployed code; Dev Mode keeps trying. The credentials come from AWS profile "dev-sso": sign in again with "serverless login aws --aws-profile dev-sso" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile.',
      'debug: Your AWS credentials work again; Dev Mode is reconnecting to AWS IoT Core.',
    ])
    expect(reconnects).toBe(1)
    // Once the session stops, the connection's state is no longer told.
    connection.quiet()
    made.options.onState({ state: 'lost', reason: 'the connection closed' })
    made.options.onState({ state: 'reconnected', offlineMs: 1_000 })
    made.options.onState({ state: 'credentials_expired' })
    made.options.onState({ state: 'credentials_refreshed' })
    expect(logger.lines).toHaveLength(4)
    expect(reconnects).toBe(2)
    await connection.stop()
  })

  test('records the lost, restored and credentials states, also once its lines are quiet; a lost reason keeps one line without URLs', async () => {
    const records = []
    const logger = recordingLogger()
    const { made, connectTransport } = fakeTransportFactory()
    const connection = await start({
      logger,
      connectTransport,
      record: (type, fields) => records.push([type, fields]),
    })
    made.options.onState({
      state: 'lost',
      reason:
        'socket closed\nat wss://abc-ats.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Signature=x',
    })
    made.options.onState({ state: 'reconnected', offlineMs: 4_000 })
    made.options.onState({
      state: 'credentials_expired',
      error: new Error('expired'),
    })
    made.options.onState({ state: 'credentials_refreshed' })
    expect(records).toEqual([
      ['connection.lost', { reason: 'socket closed at <url>' }],
      ['connection.restored', { offline_ms: 4_000 }],
      ['credentials.expired', {}],
      ['credentials.refreshed', {}],
    ])
    // During the stop the lines are quiet; the record still says what happened.
    const lines = logger.lines.length
    connection.quiet()
    made.options.onState({ state: 'lost', reason: 'x' })
    expect(records.at(-1)).toEqual(['connection.lost', { reason: 'x' }])
    expect(logger.lines).toHaveLength(lines)
    await connection.stop()
  })

  test("while the endpoint's name does not resolve yet, the spinner says the session waits for it", async () => {
    const logger = recordingLogger()
    const spinner = []
    const { made, connectTransport } = fakeTransportFactory()
    const connection = await start({
      logger,
      connectTransport,
      spinner: { notice: (text) => spinner.push(text) },
    })
    made.options.onState({ state: 'endpoint_unresolved', region: 'eu-west-1' })
    expect(spinner).toEqual([
      'Waiting for AWS IoT Core in eu-west-1 to become reachable',
    ])
    expect(logger.lines).toEqual([])
    await connection.stop()
  })

  test('a refused connection fails the start with the transport error', async () => {
    const denied = Object.assign(
      new Error('Dev Mode could not connect to AWS IoT Core'),
      { code: 'DEV_MODE_IOT_CONNECT_DENIED' },
    )
    const { connectTransport } = fakeTransportFactory({ fail: denied })
    await expect(
      start({ logger: recordingLogger(), connectTransport }),
    ).rejects.toBe(denied)
  })

  test('a stop waits up to ten seconds for accepted invocations', () => {
    expect(DRAIN_MS).toBe(10_000)
  })
})

describe("the relay's part of a running session", () => {
  const open = async ({
    sideChannel,
    sweep,
    sweepMs,
    record,
    passedWindowMs,
  } = {}) => {
    const logger = recordingLogger()
    const timers = countingTimers()
    const opened = []
    const connection = {
      credentials: { current: () => ({ accessKeyId: 'AKID' }) },
    }
    const run = await openRelayRun({
      connection,
      openSideChannel: async (options) => {
        opened.push(options)
        return (
          sideChannel ?? {
            enabled: true,
            sweep: async ({ abortSignal } = {}) => {
              opened.push('swept')
              if (sweep === 'never') {
                // An S3 request that never answers ends only when it is aborted.
                return new Promise((resolve, reject) =>
                  abortSignal?.addEventListener('abort', () => {
                    opened.push('aborted')
                    reject(abortSignal.reason)
                  }),
                )
              }
              if (sweep) throw sweep
            },
          }
        )
      },
      provider: { name: 'provider' },
      serverless: { name: 'serverless' },
      sessionId: 's_0123456789ab',
      sessionKey: key,
      s3: 's3 client',
      deployedNames: new Map([['svc-dev-api', 'api']]),
      logger,
      timers,
      ...(sweepMs && { sweepMs }),
      ...(record && { record }),
      ...(passedWindowMs && { passedWindowMs }),
    })
    return { run, logger, timers, opened, connection }
  }

  test("opens the side channel with the session's key and credentials, and empties its prefix on stop", async () => {
    const { run, opened, timers, connection } = await open()
    expect(opened[0]).toMatchObject({
      sessionId: 's_0123456789ab',
      key,
      s3: 's3 client',
      timers,
    })
    expect(opened[0].credentials()).toEqual({ accessKeyId: 'AKID' })
    expect(run.relay).toMatchObject({
      connection,
      sessionId: 's_0123456789ab',
      sessionKey: key,
      deployedNames: new Map([['svc-dev-api', 'api']]),
    })
    run.relay.onNotRun({ id: 'r1', functionKey: 'api', reason: 'expired' })
    await run.stop()
    await run.stop()
    expect(opened.slice(1)).toEqual(['swept'])
    expect(timers.live()).toBe(0)
  })

  test('a side channel that cannot be used is said once; a failed sweep is a debug line', async () => {
    const off = await open({
      sideChannel: { enabled: false, reason: 'the bucket uses SSE-C' },
    })
    expect(off.logger.lines).toEqual([
      ['warning', sideChannelOffLine('the bucket uses SSE-C')],
    ])
    await off.run.stop()
    const failing = await open({ sweep: new Error('AccessDenied') })
    await failing.run.stop()
    expect(failing.logger.lines).toEqual([
      [
        'debug',
        'Dev Mode could not remove the payload objects of this session: AccessDenied',
      ],
    ])
  })

  test('the sweep at the end of a session is bounded: its S3 request is aborted, and what it leaves the next session removes', async () => {
    expect(SWEEP_MS).toBe(10_000)
    const { run, logger, timers, opened } = await open({
      sweep: 'never',
      sweepMs: 50,
    })
    await run.stop()
    await waitFor(() => opened.includes('aborted'))
    expect(opened.slice(1)).toEqual(['swept', 'aborted'])
    expect(logger.lines).toEqual([
      [
        'debug',
        'Dev Mode stopped waiting to remove the payload objects of this session: the next session removes them',
      ],
    ])
    expect(timers.live()).toBe(0)
  })

  test('each refusal is said with its own cause: stale requests the clock line, late ones the late line, paced ones the throughput line', async () => {
    const { run, logger } = await open()
    run.relay.onNotRun({ reason: 'stale', staleInARow: 1 })
    run.relay.onNotRun({ reason: 'stale', staleInARow: 2 })
    run.relay.onNotRun({ reason: 'expired' })
    run.relay.onNotRun({ reason: 'expired' })
    run.relay.onNotRun({ reason: 'paced' })
    expect(logger.lines).toEqual([['warning', clockOffLine()]])
    await waitFor(() => logger.lines.length === 3)
    expect(logger.lines).toEqual(
      expect.arrayContaining([
        ['warning', clockOffLine()],
        ['warning', lateLine(2)],
        ['warning', throughputLine(1)],
      ]),
    )
    await run.stop()
  })

  test('invocations left to the deployed code because every handler process was busy are said once per window and recorded', async () => {
    const records = []
    const { run, logger } = await open({
      record: (type, fields) => records.push([type, fields]),
      passedWindowMs: 20,
    })
    run.relay.onNotRun({ id: 'r1', functionKey: 'api', reason: 'worker_limit' })
    run.relay.onNotRun({ id: 'r2', functionKey: 'api', reason: 'worker_limit' })
    await waitFor(() => logger.lines.length === 1 && records.length === 1)
    expect(logger.lines).toEqual([['warning', workersBusyLine(2)]])
    expect(workersBusyLine(2)).toBe(
      '2 invocations ran the deployed code: all 24 handler processes on this machine were busy.',
    )
    expect(records).toEqual([
      [
        'invocation.passed_through',
        { function: 'api', count: 2, reason: 'worker_limit' },
      ],
    ])
    await run.stop()
  })

  test('an acceptance AWS IoT Core refused is said with its reason code, once per window', async () => {
    const { run, logger } = await open()
    run.relay.onNotRun({ reason: 'refused', reasonCode: 0x87 })
    run.relay.onNotRun({ reason: 'refused', reasonCode: 0x87 })
    await waitFor(() => logger.lines.length === 1)
    expect(logger.lines).toEqual([['warning', refusedLine(2, 0x87)]])
    await run.stop()
  })

  test('a refusal whose acceptance could not be published adds nothing to the connection line', async () => {
    const { run, logger, timers } = await open()
    run.relay.onNotRun({ reason: 'not_sent' })
    run.relay.onNotRun({ reason: 'not_sent' })
    // Nothing is waiting to be said.
    expect(timers.live()).toBe(0)
    expect(logger.lines).toEqual([])
    await run.stop()
  })

  test('requests left to the deployed code are recorded per function and reason, a burst as one record', async () => {
    const records = []
    const { run, timers } = await open({
      record: (type, fields) => records.push([type, fields]),
      passedWindowMs: 20,
    })
    run.relay.onNotRun({ id: 'r1', functionKey: 'api', reason: 'paced' })
    run.relay.onNotRun({ id: 'r2', functionKey: 'api', reason: 'paced' })
    run.relay.onNotRun({ id: 'r3', functionKey: 'api', reason: 'expired' })
    run.relay.onNotRun({
      id: 'r4',
      functionKey: 'api',
      reason: 'refused',
      reasonCode: 0x87,
    })
    run.relay.onNotRun({
      id: 'r5',
      functionKey: 'api',
      reason: 'stale',
      staleInARow: 1,
    })
    run.relay.onNotRun({ id: 'r6', functionKey: 'api', reason: 'not_sent' })
    await waitFor(() => records.length === 5)
    expect(records).toEqual([
      [
        'invocation.passed_through',
        { function: 'api', count: 2, reason: 'paced' },
      ],
      [
        'invocation.passed_through',
        { function: 'api', count: 1, reason: 'late' },
      ],
      [
        'invocation.passed_through',
        { function: 'api', count: 1, reason: 'refused' },
      ],
      [
        'invocation.passed_through',
        { function: 'api', count: 1, reason: 'clock_off' },
      ],
      [
        'invocation.passed_through',
        { function: 'api', count: 1, reason: 'offline' },
      ],
    ])
    await run.stop()
    expect(timers.live()).toBe(0)
  })

  test('what is counted when the stop begins is recorded then, and nothing after', async () => {
    const records = []
    const { run, timers } = await open({
      record: (type, fields) => records.push([type, fields]),
    })
    run.relay.onNotRun({ functionKey: 'api', reason: 'paced' })
    run.quiet()
    run.relay.onNotRun({ functionKey: 'api', reason: 'paced' })
    expect(records).toEqual([
      [
        'invocation.passed_through',
        { function: 'api', count: 1, reason: 'paced' },
      ],
    ])
    expect(timers.live()).toBe(0)
    await run.stop()
  })

  test('once quiet, nothing more is said, and no warning timer is left', async () => {
    const { run, logger, timers } = await open()
    run.relay.onNotRun({ reason: 'expired' })
    run.relay.onNotRun({ reason: 'paced' })
    expect(timers.live()).toBe(2)
    run.quiet()
    expect(timers.live()).toBe(0)
    run.relay.onNotRun({ reason: 'paced' })
    run.relay.onNotRun({ reason: 'stale', staleInARow: 2 })
    expect(timers.live()).toBe(0)
    expect(logger.lines).toEqual([])
    await run.stop()
  })

  test('counts from the bridges become one line after a reconnect, and a record per function', async () => {
    const logger = recordingLogger()
    const clock = manualClock()
    const reconnects = []
    const records = []
    const run = await openRelayRun({
      connection: {
        credentials: { current: () => ({ accessKeyId: 'AKID' }) },
        onReconnected: (fn) => reconnects.push(fn),
      },
      openSideChannel: async () => ({ enabled: false, reason: 'off' }),
      provider: { name: 'provider' },
      serverless: { name: 'serverless' },
      sessionId: 's_0123456789ab',
      sessionKey: key,
      s3: 's3 client',
      deployedNames: new Map([['svc-dev-api', 'api']]),
      logger,
      timers: clock.timers,
      now: clock.now,
      record: (type, fields) => records.push({ type, ...fields }),
    })
    // The relay run's one `record` seam also carries the connection records; only the away
    // count writes here.
    expect(reconnects).toHaveLength(1)
    reconnects[0]()
    run.relay.onPassed({
      functionKey: 'api',
      count: 2,
      since: 1,
      environmentId: 'e1',
    })
    await clock.advance(AWAY_WINDOW_MS)
    expect(logger.lines).toContainEqual([
      'warning',
      awayLine([{ functionKey: 'api', count: 2 }]),
    ])
    expect(records).toEqual([
      {
        type: 'invocation.passed_through',
        function: 'api',
        count: 2,
        reason: 'offline',
        at_least: true,
      },
    ])
    run.quiet()
    run.relay.onPassed({
      functionKey: 'api',
      count: 1,
      since: 1,
      environmentId: 'e1',
    })
    await run.stop()
    expect(records).toHaveLength(1)
    expect(clock.live()).toBe(0)
  })
  test('with web apps, requests go to the web relay, paced on the same connection, and the functions keep the rest', async () => {
    const logger = recordingLogger()
    const timers = countingTimers()
    const topics = topicsOf('s_0123456789ab')
    const seal = createSealer({ key })
    const open = createOpener({ key })
    const published = []
    let receiver = null
    const reconnects = []
    const connection = {
      credentials: { current: () => ({ accessKeyId: 'AKID' }) },
      transport: {
        publish: async (message) => {
          published.push({
            ...message,
            frame: open(message.topic, message.payload),
          })
          return true
        },
      },
      setReceiver: (fn) => {
        receiver = fn
      },
      onReconnected: (fn) => reconnects.push(fn),
    }
    const dispatched = []
    let finish
    const run = await openRelayRun({
      connection,
      openSideChannel: async () => ({ enabled: false, reason: 'off' }),
      provider: {},
      serverless: {},
      sessionId: 's_0123456789ab',
      sessionKey: key,
      s3: 's3 client',
      deployedNames: new Map([['svc-dev-api', 'api']]),
      logger,
      timers,
      web: {
        functions: new Map([['svc-dev-web', 'web']]),
        credentials: { update: () => {} },
        dispatch: async (request) => {
          dispatched.push(request)
          await new Promise((resolve) => {
            finish = resolve
          })
          return { status: 204, headers: {}, body: [] }
        },
      },
    })
    expect(run.web).toBeTruthy()
    const toFunctions = []
    run.relay.connection.setReceiver((topic, payload) =>
      toFunctions.push(payload),
    )
    const request = (id, fields = {}) =>
      seal(topics.up, {
        kind: KIND.REQUEST,
        env: 'e-web',
        fn: 'svc-dev-web',
        id,
        sentAt: Date.now(),
        method: 'GET',
        path: '/',
        headers: {},
        ...fields,
      })
    const invoke = seal(topics.up, { kind: KIND.INVOKE, env: 'e-fn', id: 'i1' })
    receiver(topics.up, invoke)
    receiver(
      topics.up,
      request('r1', { environment: { AWS_ACCESS_KEY_ID: 'ASIAX' } }),
    )
    expect(toFunctions).toEqual([invoke])
    await waitFor(() => dispatched.length === 1)
    expect(
      published.map((m) => [m.topic, m.frame.header.kind, m.priority]),
    ).toEqual([[topics.down('e-web'), KIND.ACCEPTED, 'acceptance']])
    // The stop's start takes no new request; the drain waits for the one accepted.
    run.quiet()
    receiver(topics.up, request('r2'))
    await waitFor(() => published.some((m) => m.frame.header.id === 'r2'))
    expect(
      published.find((m) => m.frame.header.id === 'r2').frame.header.kind,
    ).toBe(KIND.NOT_IN_DEV)
    const draining = run.drain(5_000)
    finish()
    await draining
    expect(
      published
        .filter((m) => m.frame.header.id === 'r1')
        .map((m) => m.frame.header.kind),
    ).toEqual([KIND.ACCEPTED, KIND.RESPONSE_START, KIND.STREAM_END])
    expect(reconnects).toHaveLength(2)
    await run.stop()
    expect(timers.live()).toBe(0)
  })

  test('without web apps the connection is handed on as it is', async () => {
    const connection = {
      credentials: { current: () => ({}) },
      setReceiver: () => {
        throw new Error('not expected')
      },
    }
    const run = await openRelayRun({
      connection,
      openSideChannel: async () => ({ enabled: false, reason: 'off' }),
      provider: {},
      serverless: {},
      sessionId: 's_0123456789ab',
      sessionKey: key,
      s3: 's3 client',
      deployedNames: new Map(),
      logger: recordingLogger(),
      timers: countingTimers(),
    })
    expect(run.relay.connection).toBe(connection)
    expect(run.web).toBeNull()
    await run.drain(1)
    await run.stop()
  })
})

describe('whether the sessions holding functions are still running', () => {
  const ENDPOINT = 'abc-ats.iot.us-east-1.amazonaws.com'
  const CREDENTIALS = { accessKeyId: 'AKID', secretAccessKey: 's' }
  const FAILED_LINE = livenessDeniedLine(
    'the check through AWS IoT Core failed',
  )
  const DENIED_LINE = livenessDeniedLine('iot:SendDirectMessage was denied')
  const attachedTo = (session, owner = 'alice@mbp') => ({
    Environment: {
      Variables: { SLS_DEV_SESSION: session, SLS_DEV_OWNER: owner },
    },
  })
  /** A check that answers `answer(id)` for each id, leaving out ids it answers undefined. */
  const answering =
    (answer) =>
    async ({ sessionIds }) =>
      new Map(
        sessionIds
          .map((id) => [id, answer(id)])
          .filter(([, state]) => state !== undefined),
      )

  test('checkSessions passes the ids, endpoint, region and credentials through', async () => {
    const calls = []
    const answer = new Map([['s_other', 'live']])
    const result = await checkSessions({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      credentials: CREDENTIALS,
      sessionIds: ['s_other'],
      request: async (options) => {
        calls.push(options)
        return answer
      },
    })
    expect(result).toBe(answer)
    expect(calls).toEqual([
      {
        endpoint: ENDPOINT,
        region: 'us-east-1',
        credentials: CREDENTIALS,
        sessionIds: ['s_other'],
      },
    ])
  })

  test('checkSessions maps a thrown error to failed for every id', async () => {
    const result = await checkSessions({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      credentials: CREDENTIALS,
      sessionIds: ['s_a', 's_b'],
      request: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      },
    })
    expect(result).toEqual(
      new Map([
        ['s_a', 'failed'],
        ['s_b', 'failed'],
      ]),
    )
  })

  const book = ({ check, credentials, waitMs } = {}) => {
    const logger = recordingLogger()
    const timers = countingTimers()
    const calls = []
    const liveness = createSessionLiveness({
      sessionId: 's_me',
      iotEndpoint: ENDPOINT,
      region: 'us-east-1',
      credentials:
        credentials ??
        createCredentialCache({ resolve: async () => CREDENTIALS }),
      check: async (options) => {
        calls.push(options)
        return check(options)
      },
      logger,
      timers,
      waitMs,
    })
    const of = (wanted) => () =>
      logger.lines.filter(([level]) => level === wanted).map(([, text]) => text)
    return {
      liveness,
      logger,
      timers,
      calls,
      warnings: of('warning'),
      debugs: of('debug'),
    }
  }

  test('every other session found on the functions is asked about once, in one call', async () => {
    const lives = new Map([
      ['a', attachedTo('s_other')],
      ['b', attachedTo('s_other')],
      ['c', attachedTo('s_third', 'bob@desk')],
      ['mine', attachedTo('s_me')],
      ['plain', { Environment: { Variables: {} } }],
      ['unselected', null],
    ])
    const { liveness, calls, logger, timers } = book({
      check: answering(() => 'live'),
    })
    await liveness.start(lives)
    expect(liveness.known).toEqual(
      new Map([
        ['s_other', 'live'],
        ['s_third', 'live'],
      ]),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      endpoint: ENDPOINT,
      region: 'us-east-1',
      credentials: CREDENTIALS,
    })
    expect([...calls[0].sessionIds].sort()).toEqual(['s_other', 's_third'])
    expect(logger.lines).toEqual([])
    expect(timers.live()).toBe(0)
  })

  test('nothing is asked when no function carries another session', async () => {
    const { liveness, calls } = book({ check: answering(() => 'live') })
    await liveness.start(
      new Map([
        ['mine', attachedTo('s_me')],
        ['plain', {}],
      ]),
    )
    expect(liveness.known).toEqual(new Map())
    expect(calls).toEqual([])
  })

  test.each([
    [['live', 'gone', 'unknown'], []],
    [['denied', 'denied'], [DENIED_LINE]],
    [['failed', 'live'], [FAILED_LINE]],
    [['failed', 'denied'], [DENIED_LINE]],
  ])('answers %j are said in %j', async (answers, lines) => {
    const ids = answers.map((_, i) => `s_${i}`)
    const { liveness, warnings } = book({
      check: answering((id) => answers[ids.indexOf(id)]),
    })
    await liveness.start(new Map(ids.map((id) => [id, attachedTo(id)])))
    expect(warnings()).toEqual(lines)
    expect([...liveness.known.values()]).toEqual(answers)
  })

  test('credentials that cannot be read make the check failed, and the warning says so', async () => {
    const { liveness, calls, warnings, debugs } = book({
      credentials: createCredentialCache({
        resolve: async () => {
          throw new Error('The SSO session has expired')
        },
      }),
      check: answering(() => 'live'),
    })
    await liveness.start(
      new Map([
        ['a', attachedTo('s_a')],
        ['b', attachedTo('s_b')],
      ]),
    )
    expect(liveness.known).toEqual(
      new Map([
        ['s_a', 'failed'],
        ['s_b', 'failed'],
      ]),
    )
    expect(calls).toEqual([])
    expect(warnings()).toEqual([
      livenessDeniedLine('your AWS credentials could not be read'),
    ])
    expect(debugs()).toEqual([
      'Dev Mode could not read the AWS credentials to check other Dev Mode sessions: The SSO session has expired',
    ])
  })

  test('a check that throws is failed for each session, said once, with a debug line', async () => {
    const { liveness, warnings, debugs } = book({
      check: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      },
    })
    await liveness.start(new Map([['a', attachedTo('s_a')]]))
    expect(liveness.known).toEqual(new Map([['s_a', 'failed']]))
    expect(warnings()).toEqual([FAILED_LINE])
    expect(debugs()).toEqual([
      'Dev Mode could not check other Dev Mode sessions: getaddrinfo ENOTFOUND',
    ])
  })

  test('each question that fails leaves a debug line', async () => {
    const { liveness, debugs } = book({
      check: async ({ sessionIds, debug }) => {
        debug(Object.assign(new Error('Rate exceeded'), { name: 'Throttling' }))
        return new Map(sessionIds.map((id) => [id, 'failed']))
      },
    })
    await liveness.start(new Map([['a', attachedTo('s_a')]]))
    expect(debugs()).toEqual([
      'Dev Mode could not ask AWS IoT Core whether another Dev Mode session is running: Rate exceeded',
    ])
  })

  test('without an answer in time every session keeps its functions, said once, and the question is withdrawn', async () => {
    let signal
    const { liveness, warnings, timers } = book({
      check: (options) => {
        signal = options.signal
        return new Promise(() => {})
      },
      waitMs: 20,
    })
    await liveness.start(new Map([['a', attachedTo('s_a', 'bob@desk')]]))
    expect(liveness.known).toEqual(new Map([['s_a', 'unknown']]))
    expect(warnings()).toEqual([
      livenessUnansweredLine('AWS IoT Core did not answer in time'),
    ])
    expect(signal.aborted).toBe(true)
    expect(timers.live()).toBe(0)
  })

  test('credentials read after the wait ended never send the question', async () => {
    const { liveness, calls, timers } = book({
      credentials: createCredentialCache({
        resolve: () =>
          new Promise((resolve) => setTimeout(() => resolve(CREDENTIALS), 60)),
      }),
      check: answering(() => 'gone'),
      waitMs: 20,
    })
    await liveness.start(new Map([['a', attachedTo('s_a')]]))
    expect(liveness.known).toEqual(new Map([['s_a', 'unknown']]))
    await waitFor(() => false, 100).catch(() => {})
    expect(calls).toEqual([])
    expect(timers.live()).toBe(0)
  })

  test('a session left out of the answer is asked again; still without one, it keeps its functions', async () => {
    const { liveness, calls, warnings } = book({
      check: answering((id) => (id === 's_a' ? 'gone' : undefined)),
    })
    await liveness.start(
      new Map([
        ['a', attachedTo('s_a')],
        ['b', attachedTo('s_b')],
      ]),
    )
    expect(calls.map((call) => call.sessionIds)).toEqual([
      ['s_a', 's_b'],
      ['s_b'],
    ])
    expect(liveness.known).toEqual(
      new Map([
        ['s_a', 'gone'],
        ['s_b', 'unknown'],
      ]),
    )
    expect(warnings()).toEqual([
      livenessUnansweredLine('the check through AWS IoT Core failed'),
    ])
  })

  test('a session found later is asked about once, however many functions it holds', async () => {
    const { liveness, calls, warnings } = book({
      check: answering(() => 'live'),
    })
    await liveness.start(new Map([['a', attachedTo('s_a')]]))
    await Promise.all([
      liveness.cover(['s_new']),
      liveness.cover(['s_new', 's_a', 's_me']),
    ])
    await liveness.cover(['s_new'])
    expect(calls.map((call) => call.sessionIds)).toEqual([['s_a'], ['s_new']])
    expect(liveness.known.get('s_new')).toBe('live')
    expect(liveness.known.has('s_me')).toBe(false)
    expect(warnings()).toEqual([])
  })

  test.each([
    ['denied', 'iot:SendDirectMessage was denied'],
    ['failed', 'the check through AWS IoT Core failed'],
    [undefined, 'the check through AWS IoT Core failed'],
  ])(
    'a session found later and answered %s keeps its functions, said once',
    async (answer, reason) => {
      const { liveness, warnings } = book({ check: answering(() => answer) })
      await liveness.cover(['s_new'])
      await liveness.cover(['s_newer'])
      expect(liveness.known).toEqual(
        new Map([
          ['s_new', 'unknown'],
          ['s_newer', 'unknown'],
        ]),
      )
      expect(warnings()).toEqual([livenessUnansweredLine(reason)])
    },
  )

  test('the wait is bounded by default', () => {
    expect(LIVENESS_WAIT_MS).toBeGreaterThan(5_000)
    expect(LIVENESS_WAIT_MS).toBeLessThanOrEqual(10_000)
  })

  test("the connection uses the session's credential cache when given one", async () => {
    const { made, connectTransport } = fakeTransportFactory()
    let reads = 0
    const credentials = createCredentialCache({
      resolve: async () => {
        reads += 1
        return CREDENTIALS
      },
    })
    const connection = await start({
      credentials,
      connectTransport,
      logger: recordingLogger(),
    })
    expect(connection.credentials).toBe(credentials)
    await made.options.credentials()
    expect(reads).toBe(1)
    await connection.stop()
  })
})
