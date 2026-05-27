import {
  parseExpression,
  buildScheduledEvent,
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
