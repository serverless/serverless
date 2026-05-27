import { jest } from '@jest/globals'

import {
  parseExpression,
  buildScheduledEvent,
  createScheduler,
} from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/schedule.js'

describe('parseExpression', () => {
  it.each([
    ['rate(1 minute)', { kind: 'rate', intervalMs: 60_000 }],
    ['rate(2 minutes)', { kind: 'rate', intervalMs: 120_000 }],
    ['rate(1 hour)', { kind: 'rate', intervalMs: 3_600_000 }],
    ['rate(3 hours)', { kind: 'rate', intervalMs: 10_800_000 }],
    ['rate(1 day)', { kind: 'rate', intervalMs: 86_400_000 }],
    ['rate(7 days)', { kind: 'rate', intervalMs: 604_800_000 }],
  ])('parses %s as %o', (expr, expected) => {
    expect(parseExpression(expr)).toEqual(expected)
  })

  it.each([
    'cron(0 12 * * ? *)',
    'cron(*/5 * * * ? *)',
    'cron(0 18 ? * MON-FRI *)',
  ])('parses %s as cron', (expr) => {
    const inner = expr.slice('cron('.length, -1)
    expect(parseExpression(expr)).toEqual({ kind: 'cron', expression: inner })
  })

  it.each([
    'rate(5 seconds)',
    'rate(1 year)',
    'rate(0 minutes)',
    'rate(minute)',
    'rate()',
    'cron()',
    'every 5 minutes',
    '',
    'rate(1 minute',
    null,
    undefined,
  ])('throws OFFLINE_SCHEDULE_INVALID_EXPRESSION for %p', (expr) => {
    expect(() => parseExpression(expr)).toThrow(
      expect.objectContaining({ code: 'OFFLINE_SCHEDULE_INVALID_EXPRESSION' }),
    )
  })

  it('error message names the offending expression', () => {
    let caught
    try {
      parseExpression('rate(5 seconds)')
    } catch (err) {
      caught = err
    }
    expect(caught.message).toContain('rate(5 seconds)')
  })
})

describe('buildScheduledEvent', () => {
  const fixedTime = new Date('2026-05-27T14:23:45.678Z')

  it('returns the AWS Scheduled Event envelope with all required fields', () => {
    const evt = buildScheduledEvent({
      functionKey: 'myFn',
      index: 0,
      region: 'us-east-1',
      time: fixedTime,
    })

    expect(evt).toMatchObject({
      account: '000000000000',
      'detail-type': 'Scheduled Event',
      detail: {},
      region: 'us-east-1',
      source: 'aws.events',
      version: '0',
    })
    expect(evt.resources).toEqual([
      'arn:aws:events:us-east-1:000000000000:rule/myFn-schedule-0',
    ])
  })

  it('strips milliseconds from the time field (AWS shape)', () => {
    const evt = buildScheduledEvent({
      functionKey: 'fn',
      index: 0,
      region: 'us-east-1',
      time: fixedTime,
    })
    expect(evt.time).toBe('2026-05-27T14:23:45Z')
    expect(evt.time).not.toMatch(/\./)
  })

  it('emits a UUID-shaped id, regenerated per call', () => {
    const a = buildScheduledEvent({
      functionKey: 'fn',
      index: 0,
      region: 'us-east-1',
      time: fixedTime,
    })
    const b = buildScheduledEvent({
      functionKey: 'fn',
      index: 0,
      region: 'us-east-1',
      time: fixedTime,
    })
    expect(a.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(a.id).not.toBe(b.id)
  })

  it('encodes index into the resources ARN', () => {
    const evt = buildScheduledEvent({
      functionKey: 'multiFn',
      index: 2,
      region: 'eu-west-1',
      time: fixedTime,
    })
    expect(evt.resources[0]).toBe(
      'arn:aws:events:eu-west-1:000000000000:rule/multiFn-schedule-2',
    )
  })
})

describe('createScheduler', () => {
  function makeStubRunner() {
    const calls = []
    let invokeImpl = async () => undefined
    return {
      calls,
      setInvokeImpl(fn) {
        invokeImpl = fn
      },
      getLambdaFunction: (functionKey) => ({
        invoke: async (event) => {
          calls.push({ functionKey, event })
          return invokeImpl(event)
        },
      }),
    }
  }

  function makeLogger() {
    const events = []
    return {
      events,
      notice(msg) {
        events.push(['notice', msg])
      },
      info(msg) {
        events.push(['info', msg])
      },
      warning(msg) {
        events.push(['warning', msg])
      },
      error(msg) {
        events.push(['error', msg])
      },
      debug() {},
    }
  }

  function makeServerless(functions) {
    return { service: { functions } }
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('rate(1 minute) fires once per 60s after start()', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(1 minute)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    jest.advanceTimersByTime(60_000)
    jest.advanceTimersByTime(60_000)
    jest.advanceTimersByTime(60_000)
    // Flush pending microtasks from invocations.
    await Promise.resolve()

    expect(runner.calls.length).toBe(3)
    await scheduler.stop()
  })

  it('rate(5 seconds) is rejected at construction', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    expect(() =>
      createScheduler({
        serverless: makeServerless({
          fn: { events: [{ schedule: 'rate(5 seconds)' }] },
        }),
        getLambdaFunction: runner.getLambdaFunction,
        logger,
        region: 'us-east-1',
      }),
    ).toThrow(
      expect.objectContaining({ code: 'OFFLINE_SCHEDULE_INVALID_EXPRESSION' }),
    )
  })

  it('cron fires at the expected minute boundary', async () => {
    // 6-field cron in croner order: sec min hour dom month dow.
    // "0 0 12 * * *" → fires at 12:00:00 UTC daily.
    jest.setSystemTime(new Date('2026-05-27T11:59:00Z'))

    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'cron(0 0 12 * * *)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    // Croner internally caps its setTimeout at 30s and re-schedules, so a
    // single 60s advance fires two timer callbacks: the first finds the
    // wall-clock still short of noon, the second crosses the boundary.
    jest.advanceTimersByTime(60_000)
    // Flush microtasks queued by croner's async _trigger() path.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(runner.calls.length).toBe(1)
    await scheduler.stop()
  })

  it('rejects invalid cron expression at construction', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    let caught
    try {
      createScheduler({
        serverless: makeServerless({
          fn: { events: [{ schedule: 'cron(not a real cron)' }] },
        }),
        getLambdaFunction: runner.getLambdaFunction,
        logger,
        region: 'us-east-1',
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('OFFLINE_SCHEDULE_INVALID_EXPRESSION')
    expect(caught.message).toContain('cron(not a real cron)')
  })

  it('honors enabled:false — counts but does not arm', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: {
          events: [{ schedule: { rate: 'rate(1 minute)', enabled: false } }],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    jest.advanceTimersByTime(600_000)
    await Promise.resolve()

    expect(runner.calls.length).toBe(0)
    expect(scheduler.scheduledCount).toBe(1)
    expect(scheduler.disabledCount).toBe(1)
    expect(logger.events.filter(([level]) => level === 'notice').length).toBe(1)
    await scheduler.stop()
  })

  it('dispatches the synthesized Scheduled Event envelope', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(1 minute)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()

    expect(runner.calls.length).toBe(1)
    expect(runner.calls[0].event.account).toBe('000000000000')
    expect(runner.calls[0].event.resources[0]).toMatch(
      /^arn:aws:events:us-east-1:000000000000:rule\/fn-schedule-0$/,
    )
    await scheduler.stop()
  })

  it('does not fire before start()', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(1 minute)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    jest.advanceTimersByTime(120_000)
    await Promise.resolve()
    expect(runner.calls.length).toBe(0)

    scheduler.start()
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
    expect(runner.calls.length).toBe(1)
    await scheduler.stop()
  })

  it('stop() clears all timers', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(1 minute)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
    expect(runner.calls.length).toBe(1)

    await scheduler.stop()
    jest.advanceTimersByTime(5 * 60_000)
    await Promise.resolve()
    expect(runner.calls.length).toBe(1)
  })

  it('logs at error level when invoke() rejects', async () => {
    const runner = makeStubRunner()
    runner.setInvokeImpl(async () => {
      throw new Error('boom')
    })
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(1 minute)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    jest.advanceTimersByTime(60_000)
    // Allow the rejected promise + catch handler to settle. The chain is:
    //   setInterval cb → invoke() (async) → throw → .catch(logger.error).
    // Each `await` flushes one microtask tick.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    const errorLogs = logger.events.filter(([level]) => level === 'error')
    expect(errorLogs.length).toBeGreaterThanOrEqual(1)
    expect(errorLogs[0][1]).toContain('fn')
    expect(errorLogs[0][1]).toContain('boom')
    await scheduler.stop()
  })
})
