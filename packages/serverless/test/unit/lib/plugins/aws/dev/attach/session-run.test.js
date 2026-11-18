import { describe, expect, test } from '@jest/globals'
import { createRunState } from '../../../../../../../lib/plugins/aws/dev/attach/session-run.js'
import {
  DRAIN_MS,
  openRelayRun,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-relay.js'
import {
  KIND,
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { countingTimers } from './fakes.js'

const key = Buffer.alloc(32, 6)
const SESSION = 's_0123456789ab'

const runState = () =>
  createRunState({
    logger: { debug: () => {} },
    ctx: {
      lifecycle: { stopping: () => {} },
      stops: { trigger: () => ({ trigger: 'signal', signal: 'SIGINT' }) },
    },
  })

describe('the end of a running session', () => {
  test('before "Dev Mode off" the web requests are drained with the invocations, then the laptop runtime stops', async () => {
    const steps = []
    const run = runState()
    run.laptop = {
      stopAccepting: () => steps.push('laptop stops accepting'),
      drain: async (ms) => {
        steps.push(`laptop drain ${ms}`)
      },
      stop: async () => steps.push('laptop stopped'),
    }
    let drained
    run.relayRun = {
      quiet: () => steps.push('web stops accepting'),
      drain: (ms) => {
        steps.push(`web drain ${ms}`)
        return new Promise((resolve) => {
          drained = () => {
            steps.push('web drained')
            resolve()
          }
        })
      },
    }
    run.beginStop()
    const finishing = run.finishLaptop()
    await new Promise((resolve) => setImmediate(resolve))
    expect(steps).not.toContain('laptop stopped')
    drained()
    await finishing
    expect(steps).toEqual([
      'web stops accepting',
      'laptop stops accepting',
      `laptop drain ${DRAIN_MS}`,
      `web drain ${DRAIN_MS}`,
      'web drained',
      'laptop stopped',
    ])
  })

  test('a web request accepted before the stop sends its whole response before the session ends', async () => {
    const timers = countingTimers()
    const topics = topicsOf(SESSION)
    const seal = createSealer({ key })
    const open = createOpener({ key })
    const frames = []
    let receiver
    const relayRun = await openRelayRun({
      connection: {
        credentials: { current: () => ({}) },
        transport: {
          publish: async (message) => {
            frames.push(open(message.topic, message.payload))
            return true
          },
        },
        setReceiver: (fn) => {
          receiver = fn
        },
      },
      openSideChannel: async () => ({ enabled: false, reason: 'off' }),
      provider: {},
      serverless: {},
      sessionId: SESSION,
      sessionKey: key,
      s3: 's3 client',
      deployedNames: new Map(),
      logger: { warning: () => {}, debug: () => {} },
      timers,
      web: {
        functions: new Map([['svc-dev-web', 'web']]),
        dispatch: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return { status: 200, headers: {}, body: [Buffer.from('done')] }
        },
      },
    })
    const run = runState()
    run.relayRun = relayRun
    receiver(
      topics.up,
      seal(topics.up, {
        kind: KIND.REQUEST,
        env: 'e1',
        fn: 'svc-dev-web',
        id: 'r1',
        sentAt: Date.now(),
        method: 'GET',
        path: '/',
        headers: {},
        environment: { AWS_ACCESS_KEY_ID: 'ASIAX' },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    run.beginStop()
    await run.finishLaptop()
    expect(frames.map((f) => f.header.kind)).toEqual([
      KIND.ACCEPTED,
      KIND.RESPONSE_START,
      KIND.STREAM_DATA,
      KIND.STREAM_END,
    ])
    await relayRun.stop()
    expect(timers.live()).toBe(0)
  })
})
