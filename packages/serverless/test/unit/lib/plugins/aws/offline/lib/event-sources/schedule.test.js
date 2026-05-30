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

  describe('cron AWS→croner translation', () => {
    it.each([
      // AWS 6-field input → croner-ready output (year dropped)
      ['cron(0 12 * * ? *)', '0 12 * * ?'],
      ['cron(*/5 * * * ? *)', '*/5 * * * ?'],
      ['cron(0 18 ? * MON-FRI *)', '0 18 ? * MON-FRI'],
      ['cron(15 10 ? * 6L 2002-2005)', '15 10 ? * 6L'],
      // AWS 5-field (POSIX-shaped) passes through
      ['cron(0 12 * * ?)', '0 12 * * ?'],
      ['cron(*/5 * * * *)', '*/5 * * * *'],
    ])('translates %s to croner pattern %s', (input, expected) => {
      expect(parseExpression(input)).toEqual({
        kind: 'cron',
        expression: expected,
      })
    })

    it.each([
      'cron(0 12)', // 2 fields — too few
      'cron(0 12 *)', // 3 fields — too few
      'cron(0 12 * *)', // 4 fields — too few
      'cron(0 12 * * ? * extra)', // 7 fields — too many
    ])('rejects %s with OFFLINE_SCHEDULE_INVALID_EXPRESSION', (expr) => {
      expect(() => parseExpression(expr)).toThrow(
        expect.objectContaining({
          code: 'OFFLINE_SCHEDULE_INVALID_EXPRESSION',
        }),
      )
    })
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
  // Loop a few rounds of `await Promise.resolve()` to drain async chains
  // queued by timer callbacks (invoke() → .catch(...) etc.). Centralizing
  // this avoids magic-number microtask loops sprinkled through tests; if a
  // chain grows an await, raise `rounds` here once instead of hunting each
  // call site. Prefer `jest.advanceTimersByTimeAsync` where it can replace
  // an advance+flush pair atomically.
  async function flushMicrotasks(rounds = 10) {
    for (let i = 0; i < rounds; i++) {
      await Promise.resolve()
    }
  }

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
    await jest.advanceTimersByTimeAsync(60_000)
    await jest.advanceTimersByTimeAsync(60_000)
    await jest.advanceTimersByTimeAsync(60_000)

    expect(runner.calls.length).toBe(3)
    await scheduler.stop()
  })

  it('accepts Framework-normalized object rate arrays', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: {
          events: [
            {
              schedule: {
                rate: ['rate(1 minute)', 'rate(2 minutes)'],
                input: { source: 'array-rate' },
              },
            },
          ],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    await jest.advanceTimersByTimeAsync(120_000)

    expect(runner.calls.length).toBe(3)
    expect(runner.calls.map((c) => c.event)).toEqual([
      { source: 'array-rate' },
      { source: 'array-rate' },
      { source: 'array-rate' },
    ])
    expect(scheduler.scheduledCount).toBe(2)
    await scheduler.stop()
  })

  it('rate(5 seconds) is skipped with a warning, not a thrown abort', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'rate(5 seconds)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })
    expect(scheduler.scheduledCount).toBe(0)
    expect(
      logger.events.filter(
        ([level, msg]) =>
          level === 'warning' && msg.includes('rate(5 seconds)'),
      ),
    ).toHaveLength(1)
  })

  it('cron(0 12 * * ? *) fires at next noon UTC', async () => {
    jest.setSystemTime(new Date('2026-05-27T11:59:00Z'))

    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'cron(0 12 * * ? *)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    // Croner caps its internal setTimeout and re-schedules transparently.
    // Advance well past the noon boundary (2 minutes from 11:59:00Z) so we
    // don't depend on the exact internal cap value; assert at least one
    // fire occurred and wall-clock crossed noon UTC.
    await jest.advanceTimersByTimeAsync(120_000)
    await flushMicrotasks()

    expect(runner.calls.length).toBeGreaterThanOrEqual(1)
    expect(Date.now()).toBeGreaterThanOrEqual(
      new Date('2026-05-27T12:00:00Z').getTime(),
    )
    await scheduler.stop()
  })

  it('skips an invalid cron expression with a warning, not a thrown abort', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: { events: [{ schedule: 'cron(not a real cron)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })
    expect(scheduler.scheduledCount).toBe(0)
    expect(
      logger.events.filter(
        ([level, msg]) =>
          level === 'warning' && msg.includes('cron(not a real cron)'),
      ),
    ).toHaveLength(1)
  })

  it('skips only the unschedulable rule and still arms the valid ones', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        good: { events: [{ schedule: 'rate(1 minute)' }] },
        bad: { events: [{ schedule: 'rate(5 seconds)' }] },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })
    expect(scheduler.scheduledCount).toBe(1)
    expect(logger.events.filter(([level]) => level === 'warning')).toHaveLength(
      1,
    )

    scheduler.start()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(1)
    await scheduler.stop()
  })

  it('warns that inputPath/inputTransformer are not emulated', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    createScheduler({
      serverless: makeServerless({
        fn: {
          events: [
            { schedule: { rate: 'rate(1 minute)', inputPath: '$.detail' } },
          ],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })
    expect(
      logger.events.filter(
        ([level, msg]) =>
          level === 'warning' && msg.includes('inputPath/inputTransformer'),
      ),
    ).toHaveLength(1)
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
    await jest.advanceTimersByTimeAsync(600_000)

    expect(runner.calls.length).toBe(0)
    expect(scheduler.scheduledCount).toBe(1)
    expect(scheduler.disabledCount).toBe(1)
    expect(logger.events.filter(([level]) => level === 'notice').length).toBe(1)
    await scheduler.stop()
  })

  it('skips a disabled-but-invalid cron with a warning, not a thrown abort', () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: {
          events: [{ schedule: { rate: 'cron(garbage)', enabled: false } }],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })
    expect(scheduler.scheduledCount).toBe(0)
    expect(
      logger.events.filter(
        ([level, msg]) => level === 'warning' && msg.includes('cron(garbage)'),
      ),
    ).toHaveLength(1)
  })

  it('delivers literal null when input is explicitly null', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        fn: {
          events: [{ schedule: { rate: 'rate(1 minute)', input: null } }],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    await jest.advanceTimersByTimeAsync(60_000)

    expect(runner.calls.length).toBe(1)
    expect(runner.calls[0].event).toBeNull()
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
    await jest.advanceTimersByTimeAsync(60_000)

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

    await jest.advanceTimersByTimeAsync(120_000)
    expect(runner.calls.length).toBe(0)

    scheduler.start()
    await jest.advanceTimersByTimeAsync(60_000)
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
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(1)

    await scheduler.stop()
    await jest.advanceTimersByTimeAsync(5 * 60_000)
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
    await jest.advanceTimersByTimeAsync(60_000)
    // Drain the rejected-promise → .catch(logger.error) chain. The async
    // timer-advance above flushes most microtasks, but the catch handler
    // may settle a tick later; let it drain.
    await flushMicrotasks()

    const errorLogs = logger.events.filter(([level]) => level === 'error')
    expect(errorLogs.length).toBeGreaterThanOrEqual(1)
    expect(errorLogs[0][1]).toContain('fn')
    expect(errorLogs[0][1]).toContain('boom')
    await scheduler.stop()
  })

  it('start() is idempotent — calling twice does not double-arm', async () => {
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
    scheduler.start()
    await jest.advanceTimersByTimeAsync(60_000)

    expect(runner.calls.length).toBe(1)
    await scheduler.stop()
  })

  it('stop() is idempotent — calling twice does not throw', async () => {
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
    await scheduler.stop()
    await expect(scheduler.stop()).resolves.toBeUndefined()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(0)
  })

  it('stop() then start() re-arms timers', async () => {
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
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(1)

    await scheduler.stop()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(1)

    scheduler.start()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(runner.calls.length).toBe(2)
    await scheduler.stop()
  })

  it('multiple schedules on one function get distinct resource ARNs by index', async () => {
    const runner = makeStubRunner()
    const logger = makeLogger()
    const scheduler = createScheduler({
      serverless: makeServerless({
        multiFn: {
          events: [
            { schedule: 'rate(1 minute)' },
            { schedule: 'rate(2 minutes)' },
          ],
        },
      }),
      getLambdaFunction: runner.getLambdaFunction,
      logger,
      region: 'us-east-1',
    })

    scheduler.start()
    await jest.advanceTimersByTimeAsync(120_000)

    expect(runner.calls.length).toBe(3) // rate(1) fires twice, rate(2) once
    const arns = runner.calls.map((c) => c.event.resources[0])
    expect(arns).toContain(
      'arn:aws:events:us-east-1:000000000000:rule/multiFn-schedule-0',
    )
    expect(arns).toContain(
      'arn:aws:events:us-east-1:000000000000:rule/multiFn-schedule-1',
    )
    await scheduler.stop()
  })

  it('no overlap, no warn — fast-resolving invokes never trip the counter', async () => {
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
    await jest.advanceTimersByTimeAsync(60_000)
    await jest.advanceTimersByTimeAsync(60_000)
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()

    expect(runner.calls.length).toBe(3)
    const overlapWarnings = logger.events.filter(
      ([level, msg]) => level === 'warning' && msg.includes('overlap'),
    )
    expect(overlapWarnings.length).toBe(0)
    await scheduler.stop()
  })

  it('overlap detected — second tick fires and emits a single warn', async () => {
    const runner = makeStubRunner()
    // Never-resolving invoke; in-flight count climbs.
    runner.setInvokeImpl(() => new Promise(() => {}))
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
    await jest.advanceTimersByTimeAsync(60_000)
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()

    // Fire-and-forget — second tick STILL invoked, observation only.
    expect(runner.calls.length).toBe(2)
    const overlapWarnings = logger.events.filter(
      ([level, msg]) => level === 'warning' && msg.includes('overlap'),
    )
    expect(overlapWarnings.length).toBe(1)
    expect(overlapWarnings[0][1]).toMatch(
      /Schedule overlap.*fn.*tick fired while 1 invocation/,
    )
    // Two invokes are hung — stop() will hit its 5s drain budget. Advance
    // the fake clock past that budget so the race resolves promptly.
    const stopPromise = scheduler.stop()
    await jest.advanceTimersByTimeAsync(5000)
    await stopPromise
  })

  it('counter decrements on success — tick after a settled invoke does not warn', async () => {
    const runner = makeStubRunner()
    // Tick 1 resolves; tick 2 and beyond hang.
    let callCount = 0
    runner.setInvokeImpl(() => {
      callCount++
      if (callCount === 1) return Promise.resolve()
      return new Promise(() => {})
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
    // Tick 1 — resolves, .finally decrements counter back to 0.
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()

    // Tick 2 — counter is 0, no warn; this invoke hangs.
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()
    let overlapWarnings = logger.events.filter(
      ([level, msg]) => level === 'warning' && msg.includes('overlap'),
    )
    expect(overlapWarnings.length).toBe(0)

    // Tick 3 — counter is 1 (from tick 2), warn fires.
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()
    overlapWarnings = logger.events.filter(
      ([level, msg]) => level === 'warning' && msg.includes('overlap'),
    )
    expect(overlapWarnings.length).toBe(1)
    // Two invokes are still hung — drain past the 5s stop() budget.
    const stopPromise = scheduler.stop()
    await jest.advanceTimersByTimeAsync(5000)
    await stopPromise
  })

  it('counter decrements on failure — rejected invoke clears the slot', async () => {
    const runner = makeStubRunner()
    let callCount = 0
    runner.setInvokeImpl(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('boom'))
      return new Promise(() => {})
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
    // Tick 1 — rejects; .catch logs error and .finally decrements counter.
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()

    // Tick 2 — counter is 0, no overlap warn.
    await jest.advanceTimersByTimeAsync(60_000)
    await flushMicrotasks()
    const overlapWarnings = logger.events.filter(
      ([level, msg]) => level === 'warning' && msg.includes('overlap'),
    )
    expect(overlapWarnings.length).toBe(0)
    // Tick 2's invoke is hung — drain past the 5s stop() budget.
    const stopPromise = scheduler.stop()
    await jest.advanceTimersByTimeAsync(5000)
    await stopPromise
  })

  // stop() drain tests use REAL timers throughout — the race between
  // setTimeout(5000) and the in-flight promise needs a single, consistent
  // clock. Switching fake↔real mid-test abandons queued fake-timer callbacks.
  describe('stop() drains in-flight invocations', () => {
    beforeEach(() => {
      jest.useRealTimers()
    })

    it('resolves immediately when no invocation is in-flight', async () => {
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
      const startMs = Date.now()
      await scheduler.stop()
      const elapsedMs = Date.now() - startMs
      expect(elapsedMs).toBeLessThan(100)
    })

    it('times out at 5s and resolves anyway when an invocation hangs', async () => {
      const runner = makeStubRunner()
      const logger = makeLogger()
      runner.setInvokeImpl(() => new Promise(() => {})) // never resolves
      const scheduler = createScheduler({
        serverless: makeServerless({
          fn: { events: [{ schedule: 'rate(1 minute)' }] },
        }),
        getLambdaFunction: runner.getLambdaFunction,
        logger,
        region: 'us-east-1',
      })
      jest.useFakeTimers({ doNotFake: ['nextTick'] })
      scheduler.start()
      await jest.advanceTimersByTimeAsync(60_000)
      expect(runner.calls.length).toBe(1)
      jest.useRealTimers()

      const startMs = Date.now()
      await scheduler.stop()
      const elapsedMs = Date.now() - startMs
      expect(elapsedMs).toBeGreaterThanOrEqual(4900)
      expect(elapsedMs).toBeLessThan(5500)
    }, 10_000)
  })
})
