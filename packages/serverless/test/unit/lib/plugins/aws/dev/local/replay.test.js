import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  REPLAY_ENVIRONMENT_ID,
  REPLAY_MARGIN_MS,
  REPLAY_RESPONSE_LIMIT,
  createReplayHandler,
  eventBytesOf,
  replayTimeoutMs,
} from '../../../../../../../lib/plugins/aws/dev/local/replay.js'
import {
  FILES,
  fnDirOf,
  invocationFileName,
} from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import { createInvocationRecorder } from '../../../../../../../lib/plugins/aws/dev/state/invocations.js'
import { countingTimers, fakeLog } from '../attach/fakes.js'
import { manualClock } from '../relay/manual-clock.js'

const ORIGINAL = '3f2a9c1e-1111-4111-8111-11111111111b'
const OTHER = '3f2a9c1e-2222-4222-8222-22222222222c'
const NEW_ID = '9b1c2d3e-0000-4000-8000-00000000000a'
const NOW = Date.parse('2026-10-05T10:42:00.000Z')
// A placeholder account, built here so no account-shaped number is written out.
const ARN = `arn:aws:lambda:us-east-1:${'0'.repeat(12)}:function:orders-dev-createOrder`

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
/** Writes one invocation file the way the recorder does; returns its path relative to the service. */
const writeInvocation = (service, fields) => {
  const record = {
    v: 1,
    request_id: ORIGINAL,
    function: 'createOrder',
    source: 'caller',
    label: 'aws:apigateway:v2:post:/orders',
    started_at: '2026-10-05T10:41:07.512Z',
    duration_ms: 38,
    init_ms: null,
    deployed_timeout_s: 6,
    outcome: 'ok',
    status_code: 200,
    caller_received: null,
    error: null,
    logs: { lines: [], truncated: false },
    event: { headers: { authorization: '[redacted]' }, body: '{"id":1}' },
    event_truncated: false,
    event_bytes: 64,
    response: { statusCode: 200, body: 'ok' },
    response_truncated: false,
    response_bytes: 30,
    context: {
      function_name: 'orders-dev-createOrder',
      memory_mb: 1024,
      deadline_ms: NOW,
    },
    redacted: ['event.headers.authorization'],
    ...fields,
  }
  const relative = path.join(
    '.serverless',
    'dev',
    FILES.invocations,
    fnDirOf(record.function),
    invocationFileName({
      startedAtMs: Date.parse(record.started_at),
      requestId: record.request_id,
    }),
  )
  fs.mkdirSync(path.dirname(path.join(service, relative)), { recursive: true })
  fs.writeFileSync(path.join(service, relative), JSON.stringify(record))
  return relative
}

/**
 * A laptop runtime whose invocations "run": each writes the replay's file (as the recorder would)
 * and resolves the recorder's wait, then answers `reply`. `writes: false` writes nothing.
 */
const harness = ({
  service,
  raw = null,
  environment = { AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE' },
  reply = {
    kind: 'response',
    contentType: 'application/json',
    body: Buffer.from('{}'),
  },
  replayFile = {},
  stopping = false,
  started = true,
  writes = true,
  timers = countingTimers(),
  scope,
}) => {
  const waits = new Map()
  const recorder = {
    rawEventOf: jest.fn(() => raw),
    expectReplay: jest.fn(),
    whenEnded: jest.fn(
      (id) => new Promise((resolve) => waits.set(id, resolve)),
    ),
    forgetReplay: jest.fn((id) => waits.delete(id)),
  }
  const runtime = {
    has: (key) => key === 'createOrder',
    latestEnvironment: (key) => (key === 'createOrder' ? environment : null),
    invoke: jest.fn(async (request) => {
      const id = request.headers['lambda-runtime-aws-request-id']
      if (writes) {
        const file = writeInvocation(service, {
          request_id: id,
          source: 'replay',
          replay_of: ORIGINAL,
          started_at: '2026-10-05T10:42:00.000Z',
          ...replayFile,
        })
        waits.get(id)?.({ file })
      }
      return reply
    }),
  }
  const logger = fakeLog()
  const replay = createReplayHandler({
    serviceDir: service,
    runtime: () => (started ? runtime : null),
    recorder: () => (started ? recorder : null),
    logger,
    isStopping: () => stopping,
    now: () => NOW,
    timers,
    randomUUID: () => NEW_ID,
    fs,
    ...(scope && { scope }),
  })
  return { replay, runtime, recorder, logger, timers }
}

describe('replaying a recorded invocation', () => {
  test('the event bytes kept in memory run again with a new id, deadline and the latest credentials', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const raw = {
      requestId: ORIGINAL,
      functionKey: 'createOrder',
      eventBytes: Buffer.from('{"headers":{"authorization":"Bearer real"}}'),
      headers: {
        'lambda-runtime-invoked-function-arn': ARN,
        'lambda-runtime-client-context': '{"client":{"app_title":"orders"}}',
        'lambda-runtime-cognito-identity':
          '{"cognitoIdentityId":"us-east-1:abc"}',
        'lambda-runtime-trace-id': 'Root=1-old',
        'lambda-runtime-aws-request-id': ORIGINAL,
        'lambda-runtime-deadline-ms': '1',
        'x-amzn-other': 'not reused',
      },
    }
    const { replay, runtime, recorder, logger, timers } = harness({
      service,
      raw,
    })
    const fields = await replay(ORIGINAL.slice(0, 8))
    const [request] = runtime.invoke.mock.calls[0]
    expect(request).toMatchObject({
      functionKey: 'createOrder',
      environmentId: REPLAY_ENVIRONMENT_ID,
      source: 'replay',
      environment: { AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE' },
    })
    // Only the headers that describe the function are reused; the id and deadline are new.
    expect(request.headers).toEqual({
      'lambda-runtime-invoked-function-arn': ARN,
      'lambda-runtime-client-context':
        raw.headers['lambda-runtime-client-context'],
      'lambda-runtime-cognito-identity':
        raw.headers['lambda-runtime-cognito-identity'],
      'lambda-runtime-aws-request-id': NEW_ID,
      'lambda-runtime-deadline-ms': String(NOW + 6_000),
    })
    expect(request.event.toString()).toBe(
      '{"headers":{"authorization":"Bearer real"}}',
    )
    expect(recorder.expectReplay).toHaveBeenCalledWith({
      requestId: NEW_ID,
      replayOf: ORIGINAL,
    })
    expect(fields).toMatchObject({
      request_id: NEW_ID,
      replay_of: ORIGINAL,
      function: 'createOrder',
      outcome: 'ok',
      status_code: 200,
      duration_ms: 38,
      response: { statusCode: 200, body: 'ok' },
    })
    expect(fields.file).toContain(NEW_ID)
    expect(fields).not.toHaveProperty('note')
    expect(fields).not.toHaveProperty('response_omitted')
    expect(logger.text()).toContain(
      'Replaying 3f2a9c1e on createOrder as 9b1c2d3e',
    )
    expect(timers.live()).toBe(0)
  })

  test('the redacted copy from the file runs when the event is no longer in memory, and says so', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay, runtime } = harness({ service, raw: null })
    const fields = await replay(ORIGINAL)
    expect(
      JSON.parse(runtime.invoke.mock.calls[0][0].event.toString()),
    ).toEqual({
      headers: { authorization: '[redacted]' },
      body: '{"id":1}',
    })
    expect(fields.note).toBe('replayed_redacted_event')
  })

  test('a prefix shorter than 8 characters, an unknown id and a shared prefix are refused', async () => {
    const service = serviceDir()
    writeInvocation(service)
    writeInvocation(service, { request_id: OTHER })
    const { replay, runtime } = harness({ service })
    await expect(replay('3f2a9c')).rejects.toMatchObject({
      reason: 'ambiguous_request_id',
    })
    await expect(replay('ffffffff')).rejects.toMatchObject({
      reason: 'invocation_not_found',
    })
    await expect(replay('3f2a9c1e')).rejects.toMatchObject({
      reason: 'ambiguous_request_id',
    })
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  test('a full id shorter than 8 characters still matches exactly', async () => {
    const service = serviceDir()
    writeInvocation(service, { request_id: 'abc123' })
    const { replay, runtime } = harness({ service })
    await replay('abc123')
    expect(runtime.invoke).toHaveBeenCalledTimes(1)
  })

  test('a short full id whose event is no longer in memory replays the copy from its file', async () => {
    const service = serviceDir()
    writeInvocation(service, { request_id: 'abc123' })
    const { replay, runtime, recorder } = harness({ service })
    // The memory's own lookup refuses a short id it does not hold, as a prefix too short to use.
    recorder.rawEventOf.mockImplementation(() => {
      throw Object.assign(new Error('too short'), {
        reason: 'ambiguous_request_id',
      })
    })
    const fields = await replay('abc123')
    expect(runtime.invoke).toHaveBeenCalledTimes(1)
    expect(fields.note).toBe('replayed_redacted_event')
  })

  test("any other failure of the memory's lookup is the replay's error", async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay, runtime, recorder } = harness({ service })
    recorder.rawEventOf.mockImplementation(() => {
      throw new Error('the memory broke')
    })
    await expect(replay(ORIGINAL)).rejects.toThrow('the memory broke')
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  test('an id that retries of an asynchronous invocation share replays the newest', async () => {
    const service = serviceDir()
    writeInvocation(service, {
      started_at: '2026-10-05T10:41:07.512Z',
      deployed_timeout_s: 6,
    })
    writeInvocation(service, {
      started_at: '2026-10-05T10:41:40.000Z',
      deployed_timeout_s: 9,
    })
    const { replay, runtime } = harness({ service })
    await replay(ORIGINAL)
    // The newer file says 9 s.
    expect(
      runtime.invoke.mock.calls[0][0].headers['lambda-runtime-deadline-ms'],
    ).toBe(String(NOW + 9_000))
  })

  test('without credentials of the function in this session it says how to get them', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay } = harness({ service, environment: null })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'Dev Mode has no credentials of the role of createOrder in this session yet: they arrive with its first invocation through AWS. Invoke it once (for example "serverless invoke -f createOrder"), then replay.',
    )
  })

  test('the invoke it suggests runs on the stage, region and profile of the session', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay } = harness({
      service,
      environment: null,
      scope: { stage: 'bob', region: 'eu-west-1', aws_profile: 'dev' },
    })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'Invoke it once (for example "serverless invoke -f createOrder --stage bob --region eu-west-1 --aws-profile dev"), then replay.',
    )
  })

  test('a truncated event that is no longer in memory is not replayed', async () => {
    const service = serviceDir()
    writeInvocation(service, {
      event: '{"big":',
      event_truncated: true,
      event_bytes: 2_000_000,
    })
    const { replay, runtime } = harness({ service })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      `The event of ${ORIGINAL} was larger than 1 MB and is no longer in memory, so it cannot be replayed.`,
    )
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  test('a response over 64 KiB stays in the file and out of the result, which says so', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const big = { body: 'x'.repeat(REPLAY_RESPONSE_LIMIT) }
    const { replay } = harness({ service, replayFile: { response: big } })
    const fields = await replay(ORIGINAL)
    expect(fields).not.toHaveProperty('response')
    expect(fields.response_omitted).toBe(true)
    expect(
      JSON.parse(fs.readFileSync(path.join(service, fields.file), 'utf8'))
        .response,
    ).toEqual(big)
  })

  test('a response of exactly 64 KiB is in the result; one byte more is left out', async () => {
    // `{"body":"…"}` is 11 bytes around the body.
    const sized = (bytes) => ({ body: 'x'.repeat(bytes - 11) })
    expect(Buffer.byteLength(JSON.stringify(sized(65_536)))).toBe(65_536)
    for (const [bytes, fits] of [
      [65_536, true],
      [65_537, false],
    ]) {
      const service = serviceDir()
      writeInvocation(service)
      const response = sized(bytes)
      const { replay } = harness({ service, replayFile: { response } })
      const fields = await replay(ORIGINAL)
      if (fits) {
        expect(fields.response).toEqual(response)
        expect(fields).not.toHaveProperty('response_omitted')
      } else {
        expect(fields).not.toHaveProperty('response')
        expect(fields.response_omitted).toBe(true)
      }
    }
    expect(REPLAY_RESPONSE_LIMIT).toBe(65_536)
  })

  test('a stream reply is read to its end before the result', async () => {
    const service = serviceDir()
    writeInvocation(service)
    let read = false
    const body = (async function* () {
      yield Buffer.from('a')
      read = true
    })()
    const { replay } = harness({
      service,
      reply: { kind: 'stream', body, ended: Promise.resolve({}) },
    })
    await replay(ORIGINAL)
    expect(read).toBe(true)
  })

  test('one replay runs at a time: another asked for meanwhile is refused at once', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay, runtime } = harness({ service })
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const invoke = runtime.invoke.getMockImplementation()
    runtime.invoke.mockImplementationOnce(async (request) => {
      await gate
      return invoke(request)
    })
    const first = replay(ORIGINAL)
    await new Promise((resolve) => setImmediate(resolve))
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'Another replay is running. Run dev replay again when it finishes.',
    )
    release()
    expect((await first).replay_of).toBe(ORIGINAL)
    expect(runtime.invoke).toHaveBeenCalledTimes(1)
    // Once it ended, the next one runs.
    await replay(ORIGINAL)
    expect(runtime.invoke).toHaveBeenCalledTimes(2)
  })

  test('a refusal from the runtime is an error at once, and the next replay still runs', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const { replay, runtime, recorder, timers } = harness({
      service,
      reply: { kind: 'not_in_dev' },
      writes: false,
    })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'Dev Mode could not run createOrder for the replay.',
    )
    expect(recorder.forgetReplay).toHaveBeenCalledWith(NEW_ID)
    runtime.invoke.mockImplementationOnce(async () => ({ kind: 'expired' }))
    await expect(replay(ORIGINAL)).rejects.toThrow('for the replay')
    expect(runtime.invoke).toHaveBeenCalledTimes(2)
    expect(timers.live()).toBe(0)
  })

  test('a reply that ended without recording the replay is an error at once, with its message', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const message =
      'Dev Mode could not start the local worker for createOrder: prepare failed'
    const { replay, recorder, timers } = harness({
      service,
      writes: false,
      reply: {
        kind: 'error',
        errorType: 'Runtime.Unknown',
        body: Buffer.from(
          JSON.stringify({
            errorType: 'Runtime.Unknown',
            errorMessage: message,
          }),
        ),
      },
    })
    // The reply names the function already: its message is said once, as it is.
    await expect(replay(ORIGINAL)).rejects.toThrow(
      expect.objectContaining({ message }),
    )
    expect(recorder.forgetReplay).toHaveBeenCalledWith(NEW_ID)
    expect(timers.live()).toBe(0)
  })

  test('a message that names another function whose name only contains this one is kept in context', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const message = 'The handler of createOrderV2 could not be loaded'
    const { replay } = harness({
      service,
      writes: false,
      reply: {
        kind: 'error',
        errorType: 'Runtime.Unknown',
        body: Buffer.from(
          JSON.stringify({
            errorType: 'Runtime.Unknown',
            errorMessage: message,
          }),
        ),
      },
    })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      expect.objectContaining({
        message: `Dev Mode could not run createOrder for the replay: ${message}`,
      }),
    )
  })

  test('a stream that ended without recording the replay is an error at once', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const body = (async function* () {
      yield Buffer.from('a')
    })()
    const { replay, recorder, timers } = harness({
      service,
      writes: false,
      reply: { kind: 'stream', body, ended: Promise.resolve({}) },
    })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'Dev Mode could not run createOrder for the replay.',
    )
    expect(recorder.forgetReplay).toHaveBeenCalledWith(NEW_ID)
    expect(timers.live()).toBe(0)
  })

  test('a replay whose run never ends is given up after its bound, and the next one runs', async () => {
    const service = serviceDir()
    writeInvocation(service)
    const clock = manualClock(NOW)
    const { replay, recorder, runtime } = harness({
      service,
      timers: clock.timers,
    })
    runtime.invoke.mockImplementationOnce(() => new Promise(() => {}))
    const first = replay(ORIGINAL)
    first.catch(() => {})
    await clock.flush()
    await clock.advance(6_000 + 2 * REPLAY_MARGIN_MS)
    await expect(first).rejects.toThrow(
      `The replay of ${ORIGINAL} on createOrder did not end`,
    )
    expect(recorder.forgetReplay).toHaveBeenCalledWith(NEW_ID)
    expect(clock.live()).toBe(0)
    const next = replay(ORIGINAL)
    await clock.flush()
    expect((await next).replay_of).toBe(ORIGINAL)
    expect(clock.live()).toBe(0)
  })

  test('nothing runs while the session is starting or stopping', async () => {
    const service = serviceDir()
    writeInvocation(service)
    await expect(
      harness({ service, started: false }).replay(ORIGINAL),
    ).rejects.toThrow(
      'Dev Mode is still starting; replay once "serverless dev wait --for ready" returns.',
    )
    await expect(
      harness({ service, stopping: true }).replay(ORIGINAL),
    ).rejects.toThrow(
      'Dev Mode is stopping; nothing more runs on this machine.',
    )
  })

  test('a session without a service directory can be built, and replays nothing', async () => {
    const invoke = jest.fn()
    const replay = createReplayHandler({
      serviceDir: undefined,
      runtime: () => ({
        has: () => true,
        latestEnvironment: () => ({}),
        invoke,
      }),
      recorder: () => ({}),
      logger: fakeLog(),
      timers: countingTimers(),
    })
    await expect(replay(ORIGINAL)).rejects.toThrow(
      'This Dev Mode session has no service directory, so it keeps no invocations to replay.',
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  test('the command waits for the function timeout plus a margin, at most 900 s of timeout', () => {
    expect(replayTimeoutMs({ deployed_timeout_s: 6 })).toBe(
      6_000 + REPLAY_MARGIN_MS,
    )
    expect(replayTimeoutMs({ deployed_timeout_s: 5000 })).toBe(
      900_000 + REPLAY_MARGIN_MS,
    )
    expect(replayTimeoutMs({ deployed_timeout_s: null })).toBe(
      900_000 + REPLAY_MARGIN_MS,
    )
  })

  test('file events become the bytes Lambda would send', () => {
    expect(eventBytesOf({ event: { a: 1 } }).toString()).toBe('{"a":1}')
    expect(eventBytesOf({ event: 'hello' }).toString()).toBe('"hello"')
    expect(
      eventBytesOf({
        event: { base64: Buffer.from([1, 2]).toString('base64') },
        event_encoding: 'base64',
      }),
    ).toEqual(Buffer.from([1, 2]))
    expect(eventBytesOf({ event: null }).toString()).toBe('null')
  })

  test('a JSON event shaped like the binary wrapper is JSON, in a file with or without its encoding', () => {
    const event = { base64: Buffer.from('not the event').toString('base64') }
    expect(eventBytesOf({ event, event_encoding: 'json' }).toString()).toBe(
      JSON.stringify(event),
    )
    // A file written before the encoding was recorded holds JSON.
    expect(eventBytesOf({ event }).toString()).toBe(JSON.stringify(event))
  })

  test('a JSON event shaped like the binary wrapper replays as itself once memory no longer holds it', async () => {
    const service = serviceDir()
    const event = { base64: Buffer.from('not the event').toString('base64') }
    const records = []
    // Memory keeps no raw event: the file's copy is what runs.
    const recorder = createInvocationRecorder({
      dir: path.join(service, '.serverless', 'dev'),
      now: () => NOW - 60_000,
      events: { emit: (type, fields) => records.push({ type, ...fields }) },
      limits: { replayBytes: 1 },
    })
    const eventBytes = Buffer.from(JSON.stringify(event))
    recorder.start({
      functionKey: 'createOrder',
      requestId: ORIGINAL,
      event,
      eventBytes,
    })
    recorder.end({
      functionKey: 'createOrder',
      requestId: ORIGINAL,
      event,
      eventBytes,
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 5,
      timeoutSeconds: 6,
    })
    expect(recorder.rawEventOf(ORIGINAL)).toBeNull()
    const { replay, runtime } = harness({ service, raw: null })
    await replay(ORIGINAL)
    expect(runtime.invoke.mock.calls[0][0].event.toString()).toBe(
      JSON.stringify(event),
    )
  })
})
