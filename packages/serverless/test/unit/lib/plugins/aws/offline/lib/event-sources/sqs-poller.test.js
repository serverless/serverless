import { jest } from '@jest/globals'
import { createQueueStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import { createRegistry } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { startSqsPollers } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/sqs-poller.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:MyQueue'
const QUEUE_URL = 'http://localhost:3002/000000000000/MyQueue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal stub logger that silently discards all messages.
 */
function makeLogger() {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}

/**
 * Builds a stub Lambda function (the shared facade abstraction) whose
 * `.invoke(event)` records each call and returns the given result.
 */
function makeLambdaFn(invokeFn) {
  return {
    invoke: invokeFn ?? jest.fn().mockResolvedValue(undefined),
  }
}

/**
 * Builds a `getLambdaFunction` lookup keyed by function name. If `byKey` only
 * contains one entry, that entry is returned regardless of the requested key.
 */
function makeGetLambdaFunction(byKey) {
  return (functionKey) => {
    const keys = Object.keys(byKey)
    if (keys.length === 1) return byKey[keys[0]]
    return byKey[functionKey]
  }
}

/**
 * Populates a registry with one SQS record for QUEUE_ARN / QUEUE_URL plus
 * any extras provided.
 */
function makeRegistry({ extraQueues = [] } = {}) {
  const registry = createRegistry()
  registry.sqs.set('MyQueue', {
    logicalId: 'MyQueue',
    name: 'MyQueue',
    arn: QUEUE_ARN,
    url: QUEUE_URL,
    properties: {},
  })
  for (const { logicalId, arn, url } of extraQueues) {
    registry.sqs.set(logicalId, {
      logicalId,
      name: logicalId,
      arn,
      url,
      properties: {},
    })
  }
  return registry
}

/**
 * Builds a minimal stub `serverless` object with the given functions.
 */
function makeServerless({
  functions = {},
  serviceDir = '/tmp/fake-service',
} = {}) {
  return {
    serviceDir,
    config: { servicePath: serviceDir },
    service: {
      provider: {},
      functions,
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it('1. no sqs events: pollerCount === 0 and stop() is a no-op', async () => {
  const store = createQueueStore()
  const registry = makeRegistry()
  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [],
      },
    },
  })
  const lambdaFn = makeLambdaFn()
  const logger = makeLogger()

  const controller = await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  expect(controller.pollerCount).toBe(0)
  await expect(controller.stop()).resolves.toBeUndefined()
})

it('2. one sqs event: subscription fires lambda.invoke with correctly-shaped Records', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const lambdaFn = makeLambdaFn(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        timeout: 30,
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  const controller = await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  expect(controller.pollerCount).toBe(1)

  store.send(QUEUE_URL, 'hello world', {})

  expect(invokeMock).toHaveBeenCalledTimes(1)

  const [event] = invokeMock.mock.calls[0]
  const records = event.Records
  expect(records).toHaveLength(1)
  expect(records[0].eventSource).toBe('aws:sqs')
  expect(records[0].body).toBe('hello world')
  expect(records[0].eventSourceARN).toBe(QUEUE_ARN)

  await controller.stop()
})

it('3. ARN not in registry throws OFFLINE_SQS_QUEUE_NOT_PROVISIONED', async () => {
  const store = createQueueStore()
  const registry = createRegistry()
  const logger = makeLogger()

  const unknownArn = 'arn:aws:sqs:us-east-1:000000000000:NonExistentQueue'
  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: unknownArn } }],
      },
    },
  })

  await expect(
    startSqsPollers({
      serverless,
      registry,
      store,
      getLambdaFunction: makeGetLambdaFunction({ myFn: makeLambdaFn() }),
      logger,
    }),
  ).rejects.toMatchObject({
    code: 'OFFLINE_SQS_QUEUE_NOT_PROVISIONED',
    message: expect.stringContaining(unknownArn),
  })
})

it('4. CFN intrinsic ARN object throws OFFLINE_SQS_UNRESOLVED_ARN', async () => {
  const store = createQueueStore()
  const registry = makeRegistry()
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: { 'Fn::GetAtt': ['MyQueue', 'Arn'] } } }],
      },
    },
  })

  await expect(
    startSqsPollers({
      serverless,
      registry,
      store,
      getLambdaFunction: makeGetLambdaFunction({ myFn: makeLambdaFn() }),
      logger,
    }),
  ).rejects.toMatchObject({ code: 'OFFLINE_SQS_UNRESOLVED_ARN' })
})

it('5. two functions on the same queue throw OFFLINE_SQS_DUPLICATE_CONSUMER', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      fnA: {
        handler: 'src/a.handler',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
      fnB: {
        handler: 'src/b.handler',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  await expect(
    startSqsPollers({
      serverless,
      registry,
      store,
      getLambdaFunction: makeGetLambdaFunction({
        fnA: makeLambdaFn(),
        fnB: makeLambdaFn(),
      }),
      logger,
    }),
  ).rejects.toMatchObject({ code: 'OFFLINE_SQS_DUPLICATE_CONSUMER' })
})

it('6. stop() unsubscribes; messages sent after stop do not invoke lambda', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const lambdaFn = makeLambdaFn(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  const controller = await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  store.send(QUEUE_URL, 'before-stop', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)

  await controller.stop()

  store.send(QUEUE_URL, 'after-stop', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
})

it('7. lambda.invoke errors do not kill the poller — subsequent messages still invoke', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const logger = makeLogger()

  let callCount = 0
  const invokeMock = jest.fn().mockImplementation(() => {
    callCount += 1
    if (callCount === 1) {
      return Promise.reject(new Error('handler-boom'))
    }
    return Promise.resolve(undefined)
  })
  const lambdaFn = makeLambdaFn(invokeMock)

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  const controller = await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  store.send(QUEUE_URL, 'msg-1', {})
  await Promise.resolve()
  store.send(QUEUE_URL, 'msg-2', {})
  await Promise.resolve()
  store.send(QUEUE_URL, 'msg-3', {})
  await Promise.resolve()

  expect(invokeMock).toHaveBeenCalledTimes(3)

  await controller.stop()
})

it('8. event envelope matches AWS SQS shape', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const lambdaFn = makeLambdaFn(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  store.send(QUEUE_URL, '{"key":"value"}', {})

  const [event] = invokeMock.mock.calls[0]
  expect(event).toHaveProperty('Records')
  expect(event.Records).toHaveLength(1)

  const rec = event.Records[0]
  expect(typeof rec.messageId).toBe('string')
  expect(rec.body).toBe('{"key":"value"}')
  expect(rec.eventSource).toBe('aws:sqs')
  expect(rec.eventSourceARN).toBe(QUEUE_ARN)
  expect(typeof rec.receiptHandle).toBe('string')
  expect(rec.attributes).toMatchObject({
    ApproximateReceiveCount: '1',
    SenderId: 'AIDAOFFLINE',
  })
  expect(rec.md5OfBody).toBeTruthy()
})

it('9. short string form "sqs: <arn>" is also handled', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const lambdaFn = makeLambdaFn(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: QUEUE_ARN }],
      },
    },
  })

  await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction: makeGetLambdaFunction({ myFn: lambdaFn }),
    logger,
  })

  store.send(QUEUE_URL, 'short-form', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock.mock.calls[0][0].Records[0].body).toBe('short-form')
})

it('10. getLambdaFunction is looked up using the function key', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const logger = makeLogger()

  const getLambdaFunction = jest.fn(() =>
    makeLambdaFn(jest.fn().mockResolvedValue(undefined)),
  )

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  await startSqsPollers({
    serverless,
    registry,
    store,
    getLambdaFunction,
    logger,
  })

  store.send(QUEUE_URL, 'lookup-test', {})
  expect(getLambdaFunction).toHaveBeenCalledWith('myFn')
})
