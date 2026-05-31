import { jest } from '@jest/globals'
import { createTopicStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/topic-store.js'
import {
  createRegistry,
  registerSnsTopic,
  registerLambda,
  registerSqsQueue,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { wireSns } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/sns-wiring.js'

const ACCOUNT = '000000000000'
const REGION = 'us-east-1'

/**
 * Builds a stub logger that silently discards all messages.
 */
function makeLogger() {
  return {
    info: jest.fn(),
    notice: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }
}

/**
 * Build a minimal `serverless` stand-in with the given functions and compiled
 * template Resources.
 */
function makeServerless({ functions = {}, resources = {} } = {}) {
  return {
    service: {
      functions,
      provider: {
        compiledCloudFormationTemplate: { Resources: resources },
      },
    },
  }
}

function snsArn(name) {
  return `arn:aws:sns:${REGION}:${ACCOUNT}:${name}`
}

function lambdaArn(name) {
  return `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`
}

function sqsArn(name) {
  return `arn:aws:sqs:${REGION}:${ACCOUNT}:${name}`
}

test('ensures every registry topic in the store', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders',
    arn: snsArn('orders'),
  })
  const store = createTopicStore()

  const result = wireSns({
    serverless: makeServerless(),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getTopicByArn(snsArn('orders'))).toBeDefined()
  expect(store.getTopicByArn(snsArn('orders')).name).toBe('orders')
  expect(result.topicCount).toBe(1)
})

test('marks a registry topic ending in .fifo as a FIFO topic', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders.fifo',
    arn: snsArn('orders.fifo'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless(),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getTopicByArn(snsArn('orders.fifo')).fifo).toBe(true)
})

test('wires an events:-sns string topic name into a lambda subscription', () => {
  const registry = createRegistry()
  registerLambda(registry, {
    logicalId: 'HelloLambdaFunction',
    functionKey: 'hello',
    name: 'svc-dev-hello',
    arn: lambdaArn('svc-dev-hello'),
  })
  const store = createTopicStore()

  const result = wireSns({
    serverless: makeServerless({
      functions: { hello: { events: [{ sns: 'my-topic' }] } },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  const topic = store.getTopicByArn(snsArn('my-topic'))
  expect(topic).toBeDefined()
  const subs = store.listSubscriptionsByTopic(snsArn('my-topic'))
  expect(subs).toHaveLength(1)
  expect(subs[0].protocol).toBe('lambda')
  expect(subs[0].target).toEqual({ kind: 'lambda', functionKey: 'hello' })
  expect(result.subscriptionCount).toBe(1)
})

test('wires an events:-sns string ARN into a lambda subscription', () => {
  const registry = createRegistry()
  registerLambda(registry, {
    logicalId: 'HelloLambdaFunction',
    functionKey: 'hello',
    name: 'svc-dev-hello',
    arn: lambdaArn('svc-dev-hello'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless({
      functions: {
        hello: { events: [{ sns: snsArn('existing-topic') }] },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getTopicByArn(snsArn('existing-topic'))).toBeDefined()
  const subs = store.listSubscriptionsByTopic(snsArn('existing-topic'))
  expect(subs).toHaveLength(1)
  expect(subs[0].target).toEqual({ kind: 'lambda', functionKey: 'hello' })
})

test('wires an events:-sns object with topicName plus a filter policy', () => {
  const registry = createRegistry()
  registerLambda(registry, {
    logicalId: 'HelloLambdaFunction',
    functionKey: 'hello',
    name: 'svc-dev-hello',
    arn: lambdaArn('svc-dev-hello'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless({
      functions: {
        hello: {
          events: [
            {
              sns: {
                topicName: 'objTopic',
                filterPolicy: { color: ['blue'] },
                filterPolicyScope: 'MessageBody',
              },
            },
          ],
        },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getTopicByArn(snsArn('objTopic'))).toBeDefined()
  const subs = store.listSubscriptionsByTopic(snsArn('objTopic'))
  expect(subs).toHaveLength(1)
  expect(subs[0].filterPolicy).toEqual({ color: ['blue'] })
  expect(subs[0].filterPolicyScope).toBe('MessageBody')
})

test('wires an events:-sns object with an arn', () => {
  const registry = createRegistry()
  registerLambda(registry, {
    logicalId: 'HelloLambdaFunction',
    functionKey: 'hello',
    name: 'svc-dev-hello',
    arn: lambdaArn('svc-dev-hello'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless({
      functions: {
        hello: { events: [{ sns: { arn: snsArn('arn-topic') } }] },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getTopicByArn(snsArn('arn-topic'))).toBeDefined()
  expect(store.listSubscriptionsByTopic(snsArn('arn-topic'))).toHaveLength(1)
})

test('wires a literal AWS::SNS::Subscription resource (sqs target)', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders',
    arn: snsArn('orders'),
  })
  registerSqsQueue(registry, {
    logicalId: 'MyQueue',
    name: 'MyQueue',
    arn: sqsArn('MyQueue'),
    url: 'http://localhost:3002/000000000000/MyQueue',
    properties: {},
  })
  const store = createTopicStore()

  const result = wireSns({
    serverless: makeServerless({
      resources: {
        OrdersToQueue: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            TopicArn: snsArn('orders'),
            Endpoint: sqsArn('MyQueue'),
            Protocol: 'sqs',
            RawMessageDelivery: 'true',
            FilterPolicy: { color: ['blue'] },
          },
        },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  const subs = store.listSubscriptionsByTopic(snsArn('orders'))
  expect(subs).toHaveLength(1)
  expect(subs[0].protocol).toBe('sqs')
  expect(subs[0].target).toEqual({
    kind: 'sqs',
    queueUrl: 'http://localhost:3002/000000000000/MyQueue',
  })
  expect(subs[0].rawMessageDelivery).toBe(true)
  expect(subs[0].filterPolicy).toEqual({ color: ['blue'] })
  expect(result.subscriptionCount).toBe(1)
})

test('wires a literal AWS::SNS::Subscription resource (lambda target)', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders',
    arn: snsArn('orders'),
  })
  registerLambda(registry, {
    logicalId: 'HelloLambdaFunction',
    functionKey: 'hello',
    name: 'svc-dev-hello',
    arn: lambdaArn('svc-dev-hello'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless({
      resources: {
        OrdersToLambda: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            TopicArn: snsArn('orders'),
            Endpoint: lambdaArn('svc-dev-hello'),
            Protocol: 'lambda',
          },
        },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  const subs = store.listSubscriptionsByTopic(snsArn('orders'))
  expect(subs).toHaveLength(1)
  expect(subs[0].target).toEqual({ kind: 'lambda', functionKey: 'hello' })
})

test('an unresolved-intrinsic subscription is skipped and warned', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders',
    arn: snsArn('orders'),
  })
  const store = createTopicStore()
  const logger = makeLogger()

  const result = wireSns({
    serverless: makeServerless({
      resources: {
        IntrinsicSub: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            TopicArn: { Ref: 'OrdersTopic' },
            Endpoint: { 'Fn::GetAtt': ['MyQueue', 'Arn'] },
            Protocol: 'sqs',
          },
        },
      },
    }),
    registry,
    store,
    logger,
  })

  expect(store.listSubscriptionsByTopic(snsArn('orders'))).toHaveLength(0)
  expect(logger.warning).toHaveBeenCalledTimes(1)
  expect(result.subscriptionCount).toBe(0)
})

test('an unknown endpoint resolves to an unsupported target', () => {
  const registry = createRegistry()
  registerSnsTopic(registry, {
    logicalId: 'OrdersTopic',
    name: 'orders',
    arn: snsArn('orders'),
  })
  const store = createTopicStore()

  wireSns({
    serverless: makeServerless({
      resources: {
        EmailSub: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            TopicArn: snsArn('orders'),
            Endpoint: 'me@example.com',
            Protocol: 'email',
          },
        },
      },
    }),
    registry,
    store,
    logger: makeLogger(),
  })

  const subs = store.listSubscriptionsByTopic(snsArn('orders'))
  expect(subs).toHaveLength(1)
  expect(subs[0].target).toEqual({ kind: 'unsupported', protocol: 'email' })
})

test('returns zero counts for an empty service', () => {
  const result = wireSns({
    serverless: makeServerless(),
    registry: createRegistry(),
    store: createTopicStore(),
    logger: makeLogger(),
  })

  expect(result).toEqual({ topicCount: 0, subscriptionCount: 0 })
})
