import {
  createRegistry,
  registerSqsQueue,
  getSqsQueue,
  allSqsQueues,
  registerSnsTopic,
  getSnsTopic,
  allSnsTopics,
  registerS3Bucket,
  getS3Bucket,
  allS3Buckets,
  registerEventResource,
  getEventResource,
  allEventResources,
  registerLambda,
  getLambda,
  allLambdas,
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

describe('SNS topic helpers', () => {
  const record = {
    logicalId: 'T',
    name: 'orders',
    arn: 'arn:aws:sns:us-east-1:000000000000:orders',
  }

  it('registers, retrieves, and iterates topic records', () => {
    const reg = createRegistry()
    registerSnsTopic(reg, record)
    expect(getSnsTopic(reg, 'T')).toBe(record)
    expect([...allSnsTopics(reg)]).toEqual([record])
  })

  it('overwrites an existing topic with the same logical id', () => {
    const reg = createRegistry()
    registerSnsTopic(reg, { ...record, arn: 'first' })
    registerSnsTopic(reg, { ...record, arn: 'second' })
    expect(reg.sns.size).toBe(1)
    expect(getSnsTopic(reg, 'T').arn).toBe('second')
  })

  it('returns undefined for an unknown topic', () => {
    expect(getSnsTopic(createRegistry(), 'Nope')).toBeUndefined()
  })
})

describe('S3 bucket helpers', () => {
  const record = {
    logicalId: 'B',
    name: 'b',
    arn: 'arn:aws:s3:::b',
    properties: {},
  }

  it('registers, retrieves, and iterates bucket records', () => {
    const reg = createRegistry()
    registerS3Bucket(reg, record)
    expect(getS3Bucket(reg, 'B')).toBe(record)
    expect([...allS3Buckets(reg)]).toEqual([record])
  })

  it('returns undefined for an unknown bucket', () => {
    expect(getS3Bucket(createRegistry(), 'Nope')).toBeUndefined()
  })
})

describe('EventBridge resource helpers', () => {
  const bus = {
    logicalId: 'Bus',
    name: 'Bus',
    arn: 'arn:aws:events:us-east-1:000000000000:event-bus/Bus',
    kind: 'bus',
    properties: {},
  }
  const rule = {
    logicalId: 'Rule',
    name: 'Rule',
    arn: 'arn:aws:events:us-east-1:000000000000:rule/Rule',
    kind: 'rule',
    properties: {},
  }

  it('registers, retrieves, and iterates bus and rule records', () => {
    const reg = createRegistry()
    registerEventResource(reg, bus)
    registerEventResource(reg, rule)
    expect(getEventResource(reg, 'Bus')).toBe(bus)
    expect(getEventResource(reg, 'Rule')).toBe(rule)
    expect([...allEventResources(reg)]).toHaveLength(2)
  })

  it('returns undefined for an unknown event resource', () => {
    expect(getEventResource(createRegistry(), 'Nope')).toBeUndefined()
  })
})

describe('Lambda identity helpers', () => {
  const record = {
    logicalId: 'FnLambdaFunction',
    functionKey: 'fn',
    name: 'svc-dev-fn',
    arn: 'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-fn',
  }

  it('registers, retrieves, and iterates lambda identity records', () => {
    const reg = createRegistry()
    registerLambda(reg, record)
    expect(getLambda(reg, 'FnLambdaFunction')).toBe(record)
    expect([...allLambdas(reg)]).toEqual([record])
  })

  it('returns undefined for an unknown lambda', () => {
    expect(getLambda(createRegistry(), 'Nope')).toBeUndefined()
  })
})
