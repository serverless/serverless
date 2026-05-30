import { liftEventResource } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/lifters/events.js'

const identity = { resolveIntrinsics: (v) => v }

describe('liftEventResource', () => {
  it('lifts an event bus with an event-bus ARN', () => {
    const record = liftEventResource(
      'OrdersBus',
      { Type: 'AWS::Events::EventBus', Properties: { Name: 'orders-bus' } },
      identity,
    )
    expect(record).toEqual({
      logicalId: 'OrdersBus',
      name: 'orders-bus',
      arn: 'arn:aws:events:us-east-1:000000000000:event-bus/orders-bus',
      kind: 'bus',
      properties: { Name: 'orders-bus' },
    })
  })

  it('lifts a rule with a rule ARN', () => {
    const record = liftEventResource(
      'DailyRule',
      { Type: 'AWS::Events::Rule', Properties: { Name: 'daily' } },
      identity,
    )
    expect(record.kind).toBe('rule')
    expect(record.arn).toBe('arn:aws:events:us-east-1:000000000000:rule/daily')
  })

  it('falls back to the logical ID when Name is absent', () => {
    const record = liftEventResource(
      'DailyRule',
      { Type: 'AWS::Events::Rule' },
      identity,
    )
    expect(record.name).toBe('DailyRule')
    expect(record.arn).toBe(
      'arn:aws:events:us-east-1:000000000000:rule/DailyRule',
    )
  })

  it('throws OFFLINE_LIFTER_WRONG_TYPE for a non-event resource', () => {
    expect(() =>
      liftEventResource('Q', { Type: 'AWS::SQS::Queue' }, identity),
    ).toThrow(expect.objectContaining({ code: 'OFFLINE_LIFTER_WRONG_TYPE' }))
  })
})
