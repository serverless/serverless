import { parseQueueConfig } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/attributes.js'

const DLQ_ARN = 'arn:aws:sqs:us-east-1:000000000000:DeadLetterQueue'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

it('1. empty / missing properties yield the documented defaults', () => {
  expect(parseQueueConfig()).toEqual({
    visibilityTimeout: 30,
    delaySeconds: 0,
    messageRetentionPeriod: 345600,
    receiveWaitTime: 0,
    fifo: false,
    contentBasedDedup: false,
    redrive: null,
  })
  expect(parseQueueConfig({})).toEqual(parseQueueConfig())
})

// ---------------------------------------------------------------------------
// Numeric fields — accept numbers and numeric strings
// ---------------------------------------------------------------------------

it('2. numeric fields are read from numbers', () => {
  const config = parseQueueConfig({
    VisibilityTimeout: 45,
    DelaySeconds: 5,
    MessageRetentionPeriod: 60,
    ReceiveMessageWaitTimeSeconds: 20,
  })
  expect(config.visibilityTimeout).toBe(45)
  expect(config.delaySeconds).toBe(5)
  expect(config.messageRetentionPeriod).toBe(60)
  expect(config.receiveWaitTime).toBe(20)
})

it('3. numeric fields arriving as strings are coerced to numbers', () => {
  const config = parseQueueConfig({
    VisibilityTimeout: '45',
    DelaySeconds: '5',
    MessageRetentionPeriod: '60',
    ReceiveMessageWaitTimeSeconds: '20',
  })
  expect(config.visibilityTimeout).toBe(45)
  expect(config.delaySeconds).toBe(5)
  expect(config.messageRetentionPeriod).toBe(60)
  expect(config.receiveWaitTime).toBe(20)
})

// ---------------------------------------------------------------------------
// Boolean fields
// ---------------------------------------------------------------------------

it('4. FifoQueue and ContentBasedDeduplication booleans are read', () => {
  const config = parseQueueConfig({
    FifoQueue: true,
    ContentBasedDeduplication: true,
  })
  expect(config.fifo).toBe(true)
  expect(config.contentBasedDedup).toBe(true)
})

it('5. FifoQueue / ContentBasedDeduplication string "true" coerces to true', () => {
  const config = parseQueueConfig({
    FifoQueue: 'true',
    ContentBasedDeduplication: 'true',
  })
  expect(config.fifo).toBe(true)
  expect(config.contentBasedDedup).toBe(true)
})

it('6. FifoQueue / ContentBasedDeduplication string "false" coerces to false', () => {
  const config = parseQueueConfig({
    FifoQueue: 'false',
    ContentBasedDeduplication: 'false',
  })
  expect(config.fifo).toBe(false)
  expect(config.contentBasedDedup).toBe(false)
})

// ---------------------------------------------------------------------------
// RedrivePolicy — string and object forms
// ---------------------------------------------------------------------------

it('7. RedrivePolicy as a JSON string is parsed into { dlqArn, maxReceiveCount }', () => {
  const config = parseQueueConfig({
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: DLQ_ARN,
      maxReceiveCount: 3,
    }),
  })
  expect(config.redrive).toEqual({ dlqArn: DLQ_ARN, maxReceiveCount: 3 })
})

it('8. RedrivePolicy as an object is read directly', () => {
  const config = parseQueueConfig({
    RedrivePolicy: { deadLetterTargetArn: DLQ_ARN, maxReceiveCount: 5 },
  })
  expect(config.redrive).toEqual({ dlqArn: DLQ_ARN, maxReceiveCount: 5 })
})

it('9. RedrivePolicy maxReceiveCount arriving as a string is coerced to a number', () => {
  const config = parseQueueConfig({
    RedrivePolicy: { deadLetterTargetArn: DLQ_ARN, maxReceiveCount: '7' },
  })
  expect(config.redrive).toEqual({ dlqArn: DLQ_ARN, maxReceiveCount: 7 })
})

it('10. an unparseable RedrivePolicy string yields no redrive', () => {
  const config = parseQueueConfig({ RedrivePolicy: 'not-json' })
  expect(config.redrive).toBeNull()
})

it('11. a RedrivePolicy without a target arn yields no redrive', () => {
  const config = parseQueueConfig({
    RedrivePolicy: { maxReceiveCount: 3 },
  })
  expect(config.redrive).toBeNull()
})

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

it('12. a full FIFO + redrive property set parses into a complete config', () => {
  const config = parseQueueConfig({
    QueueName: 'orders.fifo',
    VisibilityTimeout: '120',
    DelaySeconds: 10,
    MessageRetentionPeriod: '1209600',
    ReceiveMessageWaitTimeSeconds: 20,
    FifoQueue: true,
    ContentBasedDeduplication: true,
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: DLQ_ARN,
      maxReceiveCount: 4,
    }),
  })
  expect(config).toEqual({
    visibilityTimeout: 120,
    delaySeconds: 10,
    messageRetentionPeriod: 1209600,
    receiveWaitTime: 20,
    fifo: true,
    contentBasedDedup: true,
    redrive: { dlqArn: DLQ_ARN, maxReceiveCount: 4 },
  })
})
