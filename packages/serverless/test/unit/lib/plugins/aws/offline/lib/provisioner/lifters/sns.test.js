import { liftSnsTopic } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/lifters/sns.js'

const identity = { resolveIntrinsics: (v) => v }

describe('liftSnsTopic', () => {
  it('uses a literal TopicName and synthesizes the topic ARN', () => {
    const record = liftSnsTopic(
      'OrdersTopic',
      { Type: 'AWS::SNS::Topic', Properties: { TopicName: 'orders' } },
      identity,
    )
    expect(record).toEqual({
      logicalId: 'OrdersTopic',
      name: 'orders',
      arn: 'arn:aws:sns:us-east-1:000000000000:orders',
    })
  })

  it('falls back to the logical ID when TopicName is absent', () => {
    const record = liftSnsTopic(
      'OrdersTopic',
      { Type: 'AWS::SNS::Topic' },
      identity,
    )
    expect(record.name).toBe('OrdersTopic')
    expect(record.arn).toBe('arn:aws:sns:us-east-1:000000000000:OrdersTopic')
  })

  it('resolves intrinsics in Properties before reading the name', () => {
    const resolveIntrinsics = (props) => ({ TopicName: 'resolved-name' })
    const record = liftSnsTopic(
      'T',
      { Type: 'AWS::SNS::Topic', Properties: { TopicName: { Ref: 'X' } } },
      { resolveIntrinsics },
    )
    expect(record.name).toBe('resolved-name')
  })

  it('throws OFFLINE_LIFTER_WRONG_TYPE for a non-topic resource', () => {
    expect(() =>
      liftSnsTopic('Q', { Type: 'AWS::SQS::Queue' }, identity),
    ).toThrow(expect.objectContaining({ code: 'OFFLINE_LIFTER_WRONG_TYPE' }))
  })
})
