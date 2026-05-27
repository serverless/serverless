import { parseExpression } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/schedule.js'

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
