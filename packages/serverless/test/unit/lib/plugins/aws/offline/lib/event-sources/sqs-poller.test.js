import { jest } from '@jest/globals'
import { createQueueStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import { createRegistry } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import {
  startSqsPollers,
  toLambdaMessageAttributes,
} from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/sqs-poller.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:MyQueue'
const QUEUE_URL = 'http://localhost:3002/000000000000/MyQueue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flush the microtask queue a few times so the poller's invoke → delete →
 * finally → re-drain chain settles before assertions. The chain is a handful of
 * `.then`/`.catch`/`.finally` links per batch, so several ticks cover it.
 */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

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

it('7. a thrown/rejected invoke does not kill the poller — later messages still invoke', async () => {
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

  // First batch rejects; let its delete/finally chain settle so the in-flight
  // guard clears before the next send.
  store.send(QUEUE_URL, 'msg-1', {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
  await flushMicrotasks()

  // A subsequent message still reaches the handler — the poller survived.
  store.send(QUEUE_URL, 'msg-2', {})
  expect(invokeMock).toHaveBeenCalledTimes(2)
  await flushMicrotasks()

  expect(logger.error).toHaveBeenCalled()

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

// ---------------------------------------------------------------------------
// 11. Batch delivery: many available messages arrive in a single invoke.
// ---------------------------------------------------------------------------

it('11. delivers multiple available messages in one batched invoke (honors batchSize)', async () => {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL)

  const registry = makeRegistry()

  // Gate the FIRST invoke so it stays pending while we enqueue the rest. With
  // the poller in flight, those sends only re-arm `pending`; when the gate
  // releases, the re-drain pulls every now-available message as one batch.
  let releaseFirst
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve
  })
  let call = 0
  const invokeMock = jest.fn().mockImplementation(() => {
    call += 1
    return call === 1 ? firstPending : Promise.resolve(undefined)
  })
  const lambdaFn = makeLambdaFn(invokeMock)
  const logger = makeLogger()

  const serverless = makeServerless({
    functions: {
      myFn: {
        handler: 'src/handler.main',
        events: [{ sqs: { arn: QUEUE_ARN, batchSize: 5 } }],
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

  // First send → invoke #1 (pending). The next four arrive while in flight.
  for (let i = 0; i < 5; i += 1) store.send(QUEUE_URL, `m${i}`, {})
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock.mock.calls[0][0].Records.map((r) => r.body)).toEqual(['m0'])

  // Release the gate: the re-drain pulls m1..m4 as a single batch.
  releaseFirst(undefined)
  await flushMicrotasks()

  expect(invokeMock).toHaveBeenCalledTimes(2)
  expect(invokeMock.mock.calls[1][0].Records.map((r) => r.body)).toEqual([
    'm1',
    'm2',
    'm3',
    'm4',
  ])
  // Everything was deleted on success.
  expect(store.size(QUEUE_URL)).toBe(0)
})

// ---------------------------------------------------------------------------
// 12. Delete-on-success removes the whole received batch.
// ---------------------------------------------------------------------------

it('12. delete-on-success removes every received message', async () => {
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

  store.send(QUEUE_URL, 'a', {})
  store.send(QUEUE_URL, 'b', {})
  await flushMicrotasks()

  expect(store.size(QUEUE_URL)).toBe(0)
})

// ---------------------------------------------------------------------------
// 13. batchItemFailures keeps only the reported failure in flight while the
//     non-failed records of the SAME batch are deleted; the failure reappears
//     after the visibility window lapses and its receiveCount increments.
// ---------------------------------------------------------------------------

it('13. partial-failure report deletes the successes and redelivers only the failure', async () => {
  let clock = 1_000_000
  const store = createQueueStore({ now: () => clock })
  // Short visibility so a single sweep step makes the failure visible again.
  store.ensureQueue(QUEUE_URL, { visibilityTimeout: 10 })

  const registry = makeRegistry()

  // Gate the first invoke so the two messages enqueued behind it drain as a
  // single batch on the re-drain; that batch reports its 2nd record as failed.
  let releaseFirst
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve
  })
  let call = 0
  const batches = []
  const invokeMock = jest.fn().mockImplementation((event) => {
    call += 1
    batches.push(event.Records.map((r) => r.body))
    // Batch #1 (the gated `seed` message) succeeds once released. Batch #2
    // carries [ok, fail] and reports `fail` as the partial failure.
    if (call === 1) return firstPending
    if (call === 2) {
      return Promise.resolve({
        batchItemFailures: [{ itemIdentifier: event.Records[1].messageId }],
      })
    }
    return Promise.resolve(undefined)
  })
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

  // `seed` triggers invoke #1 (gated, pending). `ok` and `fail` enqueue behind
  // the in-flight guard, then drain together as batch #2 once the gate opens.
  store.send(QUEUE_URL, 'seed', {})
  store.send(QUEUE_URL, 'ok', {})
  store.send(QUEUE_URL, 'fail', {})
  releaseFirst(undefined)
  await flushMicrotasks()

  expect(batches[0]).toEqual(['seed'])
  expect(batches[1]).toEqual(['ok', 'fail'])

  // `seed` + `ok` deleted; only the reported failure stays in flight.
  expect(store.size(QUEUE_URL)).toBe(1)

  // Advance past the visibility window and sweep — the failure becomes
  // available, wakes the poller, and is redelivered.
  clock += 11_000
  store.sweep(clock)
  await flushMicrotasks()

  expect(batches).toHaveLength(3)
  expect(batches[2]).toEqual(['fail'])
  // Second delivery of `fail` → receiveCount incremented to 2.
  expect(
    invokeMock.mock.calls[2][0].Records[0].attributes.ApproximateReceiveCount,
  ).toBe('2')
})

// ---------------------------------------------------------------------------
// 14. A thrown/rejected invoke deletes nothing — the whole batch redelivers.
// ---------------------------------------------------------------------------

it('14. a rejected invoke deletes nothing; the batch redelivers after the window', async () => {
  let clock = 2_000_000
  const store = createQueueStore({ now: () => clock })
  store.ensureQueue(QUEUE_URL, { visibilityTimeout: 10 })

  const registry = makeRegistry()
  let callCount = 0
  const invokeMock = jest.fn().mockImplementation(() => {
    callCount += 1
    if (callCount === 1) return Promise.reject(new Error('boom'))
    return Promise.resolve(undefined)
  })
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

  store.send(QUEUE_URL, 'retry-me', {})
  await flushMicrotasks()

  // Nothing deleted — the message is still present (in flight).
  expect(store.size(QUEUE_URL)).toBe(1)

  clock += 11_000
  store.sweep(clock)
  await flushMicrotasks()

  // Redelivered and (this time) processed successfully → deleted.
  expect(invokeMock).toHaveBeenCalledTimes(2)
  expect(store.size(QUEUE_URL)).toBe(0)
})

// ---------------------------------------------------------------------------
// 15. After exceeding maxReceiveCount the failing message lands in the DLQ.
// ---------------------------------------------------------------------------

it('15. a message that keeps failing dead-letters after maxReceiveCount', async () => {
  const DLQ_ARN = 'arn:aws:sqs:us-east-1:000000000000:MyDLQ'
  const DLQ_URL = 'http://localhost:3002/000000000000/MyDLQ'

  let clock = 3_000_000
  const store = createQueueStore({ now: () => clock })
  store.ensureQueue(DLQ_URL)
  store.ensureQueue(QUEUE_URL, {
    visibilityTimeout: 10,
    redrive: { dlqUrl: DLQ_URL, maxReceiveCount: 2 },
  })

  const registry = makeRegistry({
    extraQueues: [{ logicalId: 'MyDLQ', arn: DLQ_ARN, url: DLQ_URL }],
  })

  // The consumer always rejects: the message redelivers until maxReceiveCount
  // is exceeded, then the sweeper routes it to the DLQ.
  const invokeMock = jest.fn().mockRejectedValue(new Error('always-fails'))
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

  store.send(QUEUE_URL, 'poison', {})
  await flushMicrotasks() // receiveCount 1, rejected → stays in flight

  // Sweep past the window repeatedly: each sweep returns the message to
  // available (wakes the poller) until receiveCount exceeds maxReceiveCount,
  // at which point the next sweep routes it to the DLQ.
  for (let i = 0; i < 3; i += 1) {
    clock += 11_000
    store.sweep(clock)
    await flushMicrotasks()
  }

  // The source queue drained the poison message; it now lives in the DLQ.
  expect(store.size(QUEUE_URL)).toBe(0)
  expect(store.size(DLQ_URL)).toBe(1)
})

// ---------------------------------------------------------------------------
// H2. toLambdaMessageAttributes: SQS wire shape → AWS Lambda SQS-event shape.
// ---------------------------------------------------------------------------

it('16. toLambdaMessageAttributes maps a String attribute to the Lambda shape', () => {
  const out = toLambdaMessageAttributes({
    Author: { DataType: 'String', StringValue: 'alice' },
  })

  expect(out).toEqual({
    Author: {
      stringValue: 'alice',
      binaryListValues: [],
      stringListValues: [],
      dataType: 'String',
    },
  })
})

it('17. toLambdaMessageAttributes maps a Binary attribute and omits absent values', () => {
  const out = toLambdaMessageAttributes({
    Blob: { DataType: 'Binary', BinaryValue: 'AAEC' },
  })

  expect(out.Blob).toEqual({
    binaryValue: 'AAEC',
    binaryListValues: [],
    stringListValues: [],
    dataType: 'Binary',
  })
  expect(out.Blob).not.toHaveProperty('stringValue')
})

it('18. toLambdaMessageAttributes returns an empty object for no attributes', () => {
  expect(toLambdaMessageAttributes(undefined)).toEqual({})
  expect(toLambdaMessageAttributes({})).toEqual({})
})

it('19. the event record carries messageAttributes in the AWS Lambda shape', async () => {
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

  store.send(QUEUE_URL, 'body', {
    Author: { DataType: 'String', StringValue: 'alice' },
  })

  const rec = invokeMock.mock.calls[0][0].Records[0]
  expect(rec.messageAttributes).toEqual({
    Author: {
      stringValue: 'alice',
      binaryListValues: [],
      stringListValues: [],
      dataType: 'String',
    },
  })
})

// ---------------------------------------------------------------------------
// H3. batchItemFailures contract: a malformed or unrecognised report is a
// COMPLETE failure (delete none); only a fully-valid report does a partial
// delete; empty array / no report ⇒ full success.
// ---------------------------------------------------------------------------

/**
 * Drive a single batch of two messages through one invoke that returns
 * `result`, then assert how many messages remain (deleted = received − remain).
 *
 * @param {unknown} result - the value the invoke resolves with.
 * @returns {Promise<number>} the store size after the batch settles.
 */
async function runBatchWithResult(makeResult) {
  const store = createQueueStore()
  store.ensureQueue(QUEUE_URL, { visibilityTimeout: 30 })
  const registry = makeRegistry()

  let releaseFirst
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve
  })
  let call = 0
  const invokeMock = jest.fn().mockImplementation((event) => {
    call += 1
    if (call === 1) return firstPending
    if (call === 2) return Promise.resolve(makeResult(event))
    return Promise.resolve(undefined)
  })
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

  // `seed` gates invoke #1; `a` and `b` drain together as batch #2.
  store.send(QUEUE_URL, 'seed', {})
  store.send(QUEUE_URL, 'a', {})
  store.send(QUEUE_URL, 'b', {})
  releaseFirst(undefined)
  await flushMicrotasks()

  return store.size(QUEUE_URL)
}

it('20. an empty batchItemFailures array is a full success (delete all)', async () => {
  const remaining = await runBatchWithResult(() => ({ batchItemFailures: [] }))
  expect(remaining).toBe(0)
})

it('21. a result without batchItemFailures is a full success (delete all)', async () => {
  const remaining = await runBatchWithResult(() => ({ ok: true }))
  expect(remaining).toBe(0)
})

it('22. a non-object result is a full success (delete all)', async () => {
  const remaining = await runBatchWithResult(() => 'done')
  expect(remaining).toBe(0)
})

it('23. a valid partial report deletes only the unlisted messages', async () => {
  const remaining = await runBatchWithResult((event) => ({
    batchItemFailures: [{ itemIdentifier: event.Records[1].messageId }],
  }))
  // Only the listed failure stays in flight.
  expect(remaining).toBe(1)
})

it('24. a report with an unrecognised itemIdentifier is a COMPLETE failure (delete none)', async () => {
  const remaining = await runBatchWithResult(() => ({
    batchItemFailures: [{ itemIdentifier: 'not-a-real-message-id' }],
  }))
  expect(remaining).toBe(2)
})

it('25. a report with a missing/empty itemIdentifier is a COMPLETE failure (delete none)', async () => {
  const remaining = await runBatchWithResult((event) => ({
    batchItemFailures: [
      { itemIdentifier: event.Records[0].messageId },
      { itemIdentifier: '' },
    ],
  }))
  expect(remaining).toBe(2)
})

it('26. a report with a non-string itemIdentifier is a COMPLETE failure (delete none)', async () => {
  const remaining = await runBatchWithResult((event) => ({
    batchItemFailures: [{ itemIdentifier: 123 }],
  }))
  expect(remaining).toBe(2)
})
