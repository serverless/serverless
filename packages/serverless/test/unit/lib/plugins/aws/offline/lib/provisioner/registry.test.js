import {
  createRegistry,
  registerSqsQueue,
  getSqsQueue,
  allSqsQueues,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

const QUEUE_RECORD = {
  logicalId: 'Q',
  name: 'Q',
  arn: 'a',
  url: 'u',
  properties: {},
}

describe('createRegistry', () => {
  it('1. returns an object with 5 service Maps, each initially empty', () => {
    const reg = createRegistry()
    expect(reg.sqs).toBeInstanceOf(Map)
    expect(reg.sns).toBeInstanceOf(Map)
    expect(reg.s3).toBeInstanceOf(Map)
    expect(reg.events).toBeInstanceOf(Map)
    expect(reg.lambda).toBeInstanceOf(Map)
    expect(reg.sqs.size).toBe(0)
    expect(reg.sns.size).toBe(0)
    expect(reg.s3.size).toBe(0)
    expect(reg.events.size).toBe(0)
    expect(reg.lambda.size).toBe(0)
  })
})

describe('registerSqsQueue', () => {
  it('2. adds the record to registry.sqs', () => {
    const reg = createRegistry()
    registerSqsQueue(reg, QUEUE_RECORD)
    expect(reg.sqs.size).toBe(1)
    expect(reg.sqs.get('Q')).toBe(QUEUE_RECORD)
  })

  it('6. overwrites an existing entry with the same logicalId', () => {
    const reg = createRegistry()
    const first = { ...QUEUE_RECORD, url: 'first' }
    const second = { ...QUEUE_RECORD, url: 'second' }
    registerSqsQueue(reg, first)
    registerSqsQueue(reg, second)
    expect(reg.sqs.size).toBe(1)
    expect(reg.sqs.get('Q').url).toBe('second')
  })

  it('7. registering an SQS queue does not affect other Maps', () => {
    const reg = createRegistry()
    registerSqsQueue(reg, QUEUE_RECORD)
    expect(reg.sns.size).toBe(0)
    expect(reg.s3.size).toBe(0)
    expect(reg.events.size).toBe(0)
    expect(reg.lambda.size).toBe(0)
  })
})

describe('getSqsQueue', () => {
  it('3. returns the record after registration', () => {
    const reg = createRegistry()
    registerSqsQueue(reg, QUEUE_RECORD)
    expect(getSqsQueue(reg, 'Q')).toBe(QUEUE_RECORD)
  })

  it('4. returns undefined for an unknown logicalId', () => {
    const reg = createRegistry()
    expect(getSqsQueue(reg, 'Unknown')).toBeUndefined()
  })
})

describe('allSqsQueues', () => {
  it('5. iterates all registered records', () => {
    const reg = createRegistry()
    const a = {
      logicalId: 'A',
      name: 'A',
      arn: 'arn-a',
      url: 'url-a',
      properties: {},
    }
    const b = {
      logicalId: 'B',
      name: 'B',
      arn: 'arn-b',
      url: 'url-b',
      properties: {},
    }
    registerSqsQueue(reg, a)
    registerSqsQueue(reg, b)
    const records = [...allSqsQueues(reg)]
    expect(records).toHaveLength(2)
    expect(records).toContain(a)
    expect(records).toContain(b)
  })
})
