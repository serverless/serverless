import { jest } from '@jest/globals'
import { createQueueStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import { createRegistry } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { startSqsPollers } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/sqs-poller.js'
import ServerlessError from '../../../../../../../../lib/serverless-error.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:MyQueue'
const QUEUE_URL = 'http://localhost:3002/000000000000/MyQueue'
const QUEUE_ARN_2 = 'arn:aws:sqs:us-east-1:000000000000:OtherQueue'
const QUEUE_URL_2 = 'http://localhost:3002/000000000000/OtherQueue'

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
 * Builds a minimal stub runner. By default `invoke` resolves with undefined.
 */
function makeRunner(invokeFn) {
  return {
    invoke: invokeFn ?? jest.fn().mockResolvedValue(undefined),
  }
}

/**
 * Populates a registry with one SQS record for QUEUE_ARN / QUEUE_URL.
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
  providerEnvironment = {},
  serviceDir = '/tmp/fake-service',
} = {}) {
  return {
    serviceDir,
    config: { servicePath: serviceDir },
    service: {
      provider: {
        environment: providerEnvironment,
      },
      functions,
    },
  }
}

// ---------------------------------------------------------------------------
// 1. No events: - sqs declarations
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
  const runner = makeRunner()
  const logger = makeLogger()

  const controller = await startSqsPollers({
    serverless,
    registry,
    store,
    runner,
    logger,
  })

  expect(controller.pollerCount).toBe(0)
  await expect(controller.stop()).resolves.toBeUndefined()
})

// ---------------------------------------------------------------------------
// 2. One sqs event with a literal ARN — triggers runner.invoke on send
// ---------------------------------------------------------------------------

it('2. one sqs event: subscription fires runner.invoke with correctly-shaped Records', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const runner = makeRunner(invokeMock)
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
    runner,
    logger,
  })

  expect(controller.pollerCount).toBe(1)

  // Sending a message should trigger invoke exactly once
  store.send(QUEUE_URL, 'hello world', {})

  expect(invokeMock).toHaveBeenCalledTimes(1)

  const callArgs = invokeMock.mock.calls[0][0]
  const records = callArgs.event.Records
  expect(records).toHaveLength(1)
  expect(records[0].eventSource).toBe('aws:sqs')
  expect(records[0].body).toBe('hello world')
  expect(records[0].eventSourceARN).toBe(QUEUE_ARN)

  await controller.stop()
})

// ---------------------------------------------------------------------------
// 3. ARN not found in registry — throws OFFLINE_SQS_QUEUE_NOT_PROVISIONED
// ---------------------------------------------------------------------------

it('3. ARN not in registry throws OFFLINE_SQS_QUEUE_NOT_PROVISIONED', async () => {
  const store = createQueueStore()
  const registry = createRegistry() // empty registry — no queues registered
  const runner = makeRunner()
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
    startSqsPollers({ serverless, registry, store, runner, logger }),
  ).rejects.toMatchObject({
    code: 'OFFLINE_SQS_QUEUE_NOT_PROVISIONED',
    message: expect.stringContaining(unknownArn),
  })
})

// ---------------------------------------------------------------------------
// 4. CFN intrinsic ARN object — throws OFFLINE_SQS_UNRESOLVED_ARN
// ---------------------------------------------------------------------------

it('4. CFN intrinsic ARN object throws OFFLINE_SQS_UNRESOLVED_ARN', async () => {
  const store = createQueueStore()
  const registry = makeRegistry()
  const runner = makeRunner()
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        // 'Fn::GetAtt' intrinsic — not yet resolved
        events: [{ sqs: { arn: { 'Fn::GetAtt': ['MyQueue', 'Arn'] } } }],
      },
    },
  })

  await expect(
    startSqsPollers({ serverless, registry, store, runner, logger }),
  ).rejects.toMatchObject({ code: 'OFFLINE_SQS_UNRESOLVED_ARN' })
})

// ---------------------------------------------------------------------------
// 5. Two functions subscribing to the same queue — throws OFFLINE_SQS_DUPLICATE_CONSUMER
// ---------------------------------------------------------------------------

it('5. two functions on the same queue throw OFFLINE_SQS_DUPLICATE_CONSUMER', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const runner = makeRunner()
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
    startSqsPollers({ serverless, registry, store, runner, logger }),
  ).rejects.toMatchObject({ code: 'OFFLINE_SQS_DUPLICATE_CONSUMER' })
})

// ---------------------------------------------------------------------------
// 6. stop() unsubscribes all pollers — messages after stop do not invoke runner
// ---------------------------------------------------------------------------

it('6. stop() unsubscribes; messages sent after stop do not invoke runner', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const runner = makeRunner(invokeMock)
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
    runner,
    logger,
  })

  // Confirm it works before stop
  store.send(QUEUE_URL, 'before-stop', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)

  await controller.stop()

  // After stop, no more invocations
  store.send(QUEUE_URL, 'after-stop', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
})

// ---------------------------------------------------------------------------
// 7. Handler errors don't kill the poller
// ---------------------------------------------------------------------------

it('7. runner.invoke errors do not kill the poller — subsequent messages still invoke', async () => {
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
  const runner = makeRunner(invokeMock)

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
    runner,
    logger,
  })

  // First message — invoke rejects but poller survives
  store.send(QUEUE_URL, 'msg-1', {})

  // Need to allow the rejected promise to settle — since subscriber calls
  // invoke and catches errors asynchronously, flush microtasks.
  await Promise.resolve()

  // Second message — invoke succeeds
  store.send(QUEUE_URL, 'msg-2', {})
  await Promise.resolve()

  // Third message — poller still alive
  store.send(QUEUE_URL, 'msg-3', {})
  await Promise.resolve()

  expect(invokeMock).toHaveBeenCalledTimes(3)

  await controller.stop()
})

// ---------------------------------------------------------------------------
// 8. Event envelope shape spot-check
// ---------------------------------------------------------------------------

it('8. event envelope matches AWS SQS shape', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const runner = makeRunner(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
  })

  await startSqsPollers({ serverless, registry, store, runner, logger })

  store.send(QUEUE_URL, '{"key":"value"}', {})

  const { event } = invokeMock.mock.calls[0][0]
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

// ---------------------------------------------------------------------------
// 9. Environment vars set on invoke
// ---------------------------------------------------------------------------

it('9. environment vars set correctly on invoke', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const runner = makeRunner(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        environment: { MY_VAR: 'fn-value' },
        events: [{ sqs: { arn: QUEUE_ARN } }],
      },
    },
    providerEnvironment: { PROVIDER_VAR: 'prov-value' },
  })

  await startSqsPollers({ serverless, registry, store, runner, logger })

  store.send(QUEUE_URL, 'env-test', {})

  const { environment } = invokeMock.mock.calls[0][0]
  expect(environment.IS_OFFLINE).toBe('true')
  expect(environment.AWS_REGION).toBe('us-east-1')
  expect(environment.AWS_DEFAULT_REGION).toBe('us-east-1')
  expect(environment.AWS_LAMBDA_FUNCTION_NAME).toBe('myFn')
  expect(environment.MY_VAR).toBe('fn-value')
  expect(environment.PROVIDER_VAR).toBe('prov-value')
})

// ---------------------------------------------------------------------------
// 10. Short string form: events: - sqs: arn:aws:sqs:...:Q
// ---------------------------------------------------------------------------

it('10. short string form "sqs: <arn>" is also handled', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()
  const invokeMock = jest.fn().mockResolvedValue(undefined)
  const runner = makeRunner(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        // Short form: the sqs value is a string, not {arn: ...}
        events: [{ sqs: QUEUE_ARN }],
      },
    },
  })

  await startSqsPollers({ serverless, registry, store, runner, logger })

  store.send(QUEUE_URL, 'short-form', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock.mock.calls[0][0].event.Records[0].body).toBe('short-form')
})
