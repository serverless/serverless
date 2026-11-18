import {
  IoTDataPlaneClient,
  SendDirectMessageCommand,
} from '@aws-sdk/client-iot-data-plane'
import {
  LIVENESS,
  LIVENESS_TIMEOUT_MS,
  createDirectMessagingClient,
  pingSession,
  sessionsLiveness,
} from '../../../../../../../lib/plugins/aws/dev/relay/liveness.js'
import { iotSocketOptions } from '../../../../../../../lib/plugins/aws/dev/relay/network.js'
import { manualClock } from './manual-clock.js'

const credentials = {
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
  sessionToken: 'token',
}

/** An AWS SDK error as the IoT data plane client throws it. */
const awsError = (name, status) =>
  Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: status },
  })

/** Stands in for the IoT data plane client: records commands, answers with `answer`. */
const fakeClient = (answer = async () => ({})) => {
  const sent = []
  return {
    sent,
    send: async (command, options) => {
      sent.push({ command, options })
      return answer(command, options)
    },
  }
}

describe('liveness of other sessions', () => {
  test("asks Direct Messaging to deliver to that session's CLI with confirmation within 1 s", async () => {
    const client = fakeClient()
    const state = await pingSession({ client, sessionId: 's_0123456789ab' })
    expect(state).toBe(LIVENESS.LIVE)
    expect(client.sent).toHaveLength(1)
    const [{ command, options }] = client.sent
    expect(command).toBeInstanceOf(SendDirectMessageCommand)
    expect(command.input).toEqual({
      clientId: 'sls-dev-s_0123456789ab-cli',
      topic: 'sls-dev/s_0123456789ab/ping',
      confirmation: true,
      timeout: 1,
    })
    expect(options.abortSignal).toBeDefined()
  })

  test.each([
    ['ResourceNotFoundException', 404, LIVENESS.GONE],
    ['GatewayTimeoutException', 504, LIVENESS.UNKNOWN],
    // What AWS IoT Core answers for a connected client whose machine is frozen or asleep: the
    // delivery confirmation did not come within the timeout.
    ['InternalFailureException', 504, LIVENESS.UNKNOWN],
    ['ForbiddenException', 403, LIVENESS.DENIED],
    ['UnauthorizedException', 401, LIVENESS.DENIED],
    ['AccessDeniedException', 403, LIVENESS.DENIED],
    ['ThrottlingException', 429, LIVENESS.FAILED],
    ['InternalFailureException', 500, LIVENESS.FAILED],
    ['ServiceUnavailableException', 503, LIVENESS.FAILED],
    ['TimeoutError', undefined, LIVENESS.FAILED],
  ])('%s (%s) reads as %s', async (name, status, expected) => {
    const client = fakeClient(async () => {
      throw awsError(name, status)
    })
    expect(await pingSession({ client, sessionId: 's_1' })).toBe(expected)
  })

  test('a network error or an unexpected throw reads as failed', async () => {
    const network = fakeClient(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
      })
    })
    expect(await pingSession({ client: network, sessionId: 's_1' })).toBe(
      LIVENESS.FAILED,
    )
    const odd = fakeClient(async () => {
      throw 'not an error'
    })
    expect(await pingSession({ client: odd, sessionId: 's_1' })).toBe(
      LIVENESS.FAILED,
    )
  })

  test('gives up after a few seconds without an answer and leaves no timer', async () => {
    const clock = manualClock()
    const client = fakeClient(
      (command, { abortSignal }) =>
        new Promise((resolve, reject) =>
          abortSignal.addEventListener('abort', () =>
            reject(awsError('AbortError')),
          ),
        ),
    )
    let state = null
    pingSession({ client, sessionId: 's_1', timers: clock.timers }).then(
      (result) => (state = result),
    )
    await clock.flush()
    expect(state).toBeNull()
    expect(clock.live()).toBe(1)
    await clock.advance(LIVENESS_TIMEOUT_MS)
    await clock.flush()
    expect(state).toBe(LIVENESS.FAILED)
    expect(clock.live()).toBe(0)

    const answered = manualClock()
    expect(
      await pingSession({
        client: fakeClient(),
        sessionId: 's_1',
        timers: answered.timers,
      }),
    ).toBe(LIVENESS.LIVE)
    expect(answered.live()).toBe(0)
  })

  test('a question withdrawn while it waits stops at once and leaves no timer', async () => {
    const clock = manualClock()
    const client = fakeClient(
      (command, { abortSignal }) =>
        new Promise((resolve, reject) =>
          abortSignal.addEventListener('abort', () =>
            reject(awsError('AbortError')),
          ),
        ),
    )
    const withdraw = new AbortController()
    const debugged = []
    let state = null
    pingSession({
      client,
      sessionId: 's_1',
      timers: clock.timers,
      signal: withdraw.signal,
      debug: (error) => debugged.push(error),
    }).then((result) => (state = result))
    await clock.flush()
    expect(clock.live()).toBe(1)
    withdraw.abort()
    await clock.flush()
    expect(state).toBe(LIVENESS.FAILED)
    expect(clock.live()).toBe(0)
    // Nobody waits for a withdrawn question any more: nothing to say about it.
    expect(debugged).toEqual([])
  })

  test('a question withdrawn before it is sent is never sent', async () => {
    const client = fakeClient()
    const withdraw = new AbortController()
    withdraw.abort()
    const clock = manualClock()
    expect(
      await sessionsLiveness({
        client,
        sessionIds: ['s_1', 's_2'],
        timers: clock.timers,
        signal: withdraw.signal,
      }),
    ).toEqual(
      new Map([
        ['s_1', LIVENESS.FAILED],
        ['s_2', LIVENESS.FAILED],
      ]),
    )
    expect(client.sent).toEqual([])
    expect(clock.live()).toBe(0)
  })

  test('the error behind a denied or failed answer goes to debug; other answers say nothing', async () => {
    const answers = {
      s_live: null,
      s_gone: awsError('ResourceNotFoundException', 404),
      s_unknown: awsError('InternalFailureException', 504),
      s_denied: awsError('ForbiddenException', 403),
      s_failed: awsError('ThrottlingException', 429),
    }
    const client = fakeClient(async (command) => {
      const error = answers[command.input.clientId.slice(8, -4)]
      if (error) throw error
      return {}
    })
    const debugged = []
    await sessionsLiveness({
      client,
      sessionIds: Object.keys(answers),
      debug: (error) => debugged.push(error.name),
    })
    expect(debugged.sort()).toEqual([
      'ForbiddenException',
      'ThrottlingException',
    ])
  })

  test('every distinct session is asked once, in parallel, on one client', async () => {
    const client = fakeClient(async (command) => {
      if (command.input.clientId === 'sls-dev-s_a-cli') return {}
      throw awsError('ResourceNotFoundException', 404)
    })
    const states = await sessionsLiveness({
      client,
      sessionIds: ['s_a', 's_b', 's_a'],
    })
    expect(client.sent).toHaveLength(2)
    expect([...states]).toEqual([
      ['s_a', LIVENESS.LIVE],
      ['s_b', LIVENESS.GONE],
    ])
  })

  test("the client talks to the account's AWS IoT Core endpoint describe-endpoint returned, without retries", async () => {
    const client = createDirectMessagingClient({
      endpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
      region: 'us-east-1',
      credentials,
    })
    expect(client).toBeInstanceOf(IoTDataPlaneClient)
    const endpoint = await client.config.endpoint()
    expect(endpoint.hostname).toBe('abc-ats.iot.us-east-1.amazonaws.com')
    expect(endpoint.protocol).toBe('https:')
    expect(await client.config.region()).toBe('us-east-1')
    expect(await client.config.maxAttempts()).toBe(1)
    client.destroy()
  })

  test("the data plane client gives each of the endpoint's addresses 2 s to answer, as the session's connection does", async () => {
    const client = createDirectMessagingClient({
      endpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
      region: 'us-east-1',
      credentials,
    })
    const { httpsAgent } = await client.config.requestHandler.configProvider
    expect(httpsAgent.options).toMatchObject(iotSocketOptions())
    // The AWS SDK's own agent settings stay.
    expect(httpsAgent.options).toMatchObject({
      keepAlive: true,
      maxSockets: 50,
    })
    client.destroy()
  })
})
