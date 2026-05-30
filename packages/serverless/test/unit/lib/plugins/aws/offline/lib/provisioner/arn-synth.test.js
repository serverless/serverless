import {
  arnFor,
  queueUrlFor,
  s3DomainName,
  s3RegionalDomainName,
  s3WebsiteUrl,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/arn-synth.js'

describe('arnFor', () => {
  it('produces a standard SQS ARN', () => {
    expect(arnFor('sqs', 'MyQueue')).toBe(
      'arn:aws:sqs:us-east-1:000000000000:MyQueue',
    )
  })

  it('produces a standard SNS ARN', () => {
    expect(arnFor('sns', 'MyTopic')).toBe(
      'arn:aws:sns:us-east-1:000000000000:MyTopic',
    )
  })

  it('produces an S3 ARN without region or account', () => {
    expect(arnFor('s3', 'my-bucket')).toBe('arn:aws:s3:::my-bucket')
  })

  it('produces an EventBridge ARN with the event-bus/ infix', () => {
    expect(arnFor('events', 'MyBus')).toBe(
      'arn:aws:events:us-east-1:000000000000:event-bus/MyBus',
    )
  })

  it('produces a Lambda ARN with the function: infix', () => {
    expect(arnFor('lambda', 'MyFunction')).toBe(
      'arn:aws:lambda:us-east-1:000000000000:function:MyFunction',
    )
  })

  it('throws ServerlessError with code OFFLINE_UNKNOWN_ARN_SERVICE for unknown services', () => {
    expect(() => arnFor('foo', 'x')).toThrow(
      expect.objectContaining({ code: 'OFFLINE_UNKNOWN_ARN_SERVICE' }),
    )
  })
})

describe('queueUrlFor', () => {
  it('produces the SQS-style URL using the provided port', () => {
    expect(queueUrlFor('MyQueue', 4566)).toBe(
      'http://localhost:4566/000000000000/MyQueue',
    )
  })

  it('defaults to port 3002 when no port is provided', () => {
    expect(queueUrlFor('MyQueue')).toBe(
      'http://localhost:3002/000000000000/MyQueue',
    )
  })
})

describe('S3 GetAtt helpers', () => {
  it('s3DomainName produces the global bucket domain', () => {
    expect(s3DomainName('my-bucket')).toBe('my-bucket.s3.amazonaws.com')
  })

  it('s3RegionalDomainName produces the regional bucket domain', () => {
    expect(s3RegionalDomainName('my-bucket')).toBe(
      'my-bucket.s3.us-east-1.amazonaws.com',
    )
  })

  it('s3WebsiteUrl produces the website endpoint URL', () => {
    expect(s3WebsiteUrl('my-bucket')).toBe(
      'http://my-bucket.s3-website-us-east-1.amazonaws.com',
    )
  })
})
