import { jest } from '@jest/globals'
import { createDestinationRouter } from '../../../../../../../../lib/plugins/aws/offline/lib/lambda/lambda-destinations.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a stub logger that silently records every call. */
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
 * A stub registry exposing only the per-service Maps the router iterates over.
 * Seeded with one queue, one topic, one event bus and one lambda so each arn
 * kind resolves.
 */
function makeRegistry() {
  return {
    sqs: new Map([
      [
        'Q',
        {
          logicalId: 'Q',
          arn: 'arn:aws:sqs:us-east-1:000000000000:dest-queue',
          url: 'http://localhost:4567/000000000000/dest-queue',
        },
      ],
    ]),
    sns: new Map([
      [
        'T',
        {
          logicalId: 'T',
          arn: 'arn:aws:sns:us-east-1:000000000000:dest-topic',
        },
      ],
    ]),
    s3: new Map(),
    events: new Map([
      [
        'B',
        {
          logicalId: 'B',
          kind: 'bus',
          arn: 'arn:aws:events:us-east-1:000000000000:event-bus/dest-bus',
        },
      ],
    ]),
    lambda: new Map([
      [
        'L',
        {
          logicalId: 'L',
          functionKey: 'destFn',
          name: 'svc-dev-destFn',
          arn: 'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-destFn',
        },
      ],
    ]),
  }
}

/** Assemble a router plus recording stubs for every sink. */
function makeRouter(overrides = {}) {
  const queueSends = []
  const snsPublishes = []
  const ebPutEvents = []
  const lambdaInvokes = []
  const logger = makeLogger()

  const getLambdaFunction = jest.fn((functionKey) => ({
    invoke: jest.fn(async (event, options) => {
      lambdaInvokes.push({ functionKey, event, options })
    }),
  }))

  const router = createDestinationRouter({
    registry: makeRegistry(),
    getLambdaFunction,
    queueSend: jest.fn((url, message) => {
      queueSends.push({ url, message })
    }),
    snsPublish: jest.fn((topicArn, body) => {
      snsPublishes.push({ topicArn, body })
    }),
    ebPutEvents: jest.fn((busName, event) => {
      ebPutEvents.push({ busName, event })
    }),
    logger,
    now: () => '2026-05-31T00:00:00.000Z',
    uuid: () => 'req-uuid-1',
    ...overrides,
  })

  return {
    router,
    queueSends,
    snsPublishes,
    ebPutEvents,
    lambdaInvokes,
    logger,
    getLambdaFunction,
  }
}

const FUNCTION_ARN =
  'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-worker'
const SQS_ARN = 'arn:aws:sqs:us-east-1:000000000000:dest-queue'
const SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:dest-topic'
const BUS_ARN = 'arn:aws:events:us-east-1:000000000000:event-bus/dest-bus'
const LAMBDA_ARN =
  'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-destFn'

// A tick so fire-and-forget sink promises settle.
const tick = () => new Promise((r) => setImmediate(r))

describe('createDestinationRouter', () => {
  test('onSuccess routes a Success record carrying the result payload', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: SQS_ARN },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.queueSends).toHaveLength(1)
    const record = JSON.parse(ctx.queueSends[0].message.body)
    expect(ctx.queueSends[0].url).toBe(
      'http://localhost:4567/000000000000/dest-queue',
    )
    expect(record.version).toBe('1.0')
    expect(record.timestamp).toBe('2026-05-31T00:00:00.000Z')
    expect(record.requestContext).toEqual({
      requestId: 'req-uuid-1',
      functionArn: FUNCTION_ARN,
      condition: 'Success',
      approximateInvokeCount: 1,
    })
    expect(record.requestPayload).toEqual({ in: 1 })
    expect(record.responseContext.statusCode).toBe(200)
    expect(record.responseContext.executedVersion).toBe('$LATEST')
    expect(record.responseContext.functionError).toBeUndefined()
    expect(record.responsePayload).toEqual({ out: 2 })
  })

  test('onFailure routes a RetriesExhausted record with the error payload', async () => {
    const ctx = makeRouter()
    const error = new Error('boom')
    error.name = 'CustomError'
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onFailure: SQS_ARN, onSuccess: SNS_ARN },
      event: { in: 1 },
      error,
    })
    await tick()

    // The failure path resolves the onFailure arn (sqs), not onSuccess (sns).
    expect(ctx.queueSends).toHaveLength(1)
    expect(ctx.snsPublishes).toHaveLength(0)
    const record = JSON.parse(ctx.queueSends[0].message.body)
    expect(record.requestContext.condition).toBe('RetriesExhausted')
    expect(record.responseContext.functionError).toBe('Unhandled')
    expect(record.responsePayload).toEqual({
      errorType: 'CustomError',
      errorMessage: 'boom',
    })
  })

  test('no matching destination is a no-op (success without onSuccess)', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onFailure: SQS_ARN },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.queueSends).toHaveLength(0)
    expect(ctx.snsPublishes).toHaveLength(0)
    expect(ctx.ebPutEvents).toHaveLength(0)
    expect(ctx.lambdaInvokes).toHaveLength(0)
  })

  test('absent destinations object is a no-op', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: undefined,
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.queueSends).toHaveLength(0)
    expect(ctx.snsPublishes).toHaveLength(0)
    expect(ctx.ebPutEvents).toHaveLength(0)
    expect(ctx.lambdaInvokes).toHaveLength(0)
  })

  test('an sns destination publishes the stringified record body', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: SNS_ARN },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.snsPublishes).toHaveLength(1)
    expect(ctx.snsPublishes[0].topicArn).toBe(SNS_ARN)
    const record = JSON.parse(ctx.snsPublishes[0].body)
    expect(record.requestContext.condition).toBe('Success')
    expect(record.responsePayload).toEqual({ out: 2 })
  })

  test('an event-bus destination puts a wrapped EB event entry', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: BUS_ARN },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.ebPutEvents).toHaveLength(1)
    expect(ctx.ebPutEvents[0].busName).toBe('dest-bus')
    const ebEvent = ctx.ebPutEvents[0].event
    expect(ebEvent.source).toBe('lambda')
    expect(ebEvent['detail-type']).toBe(
      'Lambda Function Invocation Result - Success',
    )
    expect(ebEvent.detail.requestContext.condition).toBe('Success')
    expect(ebEvent.detail.responsePayload).toEqual({ out: 2 })
  })

  test('a lambda destination invokes the resolved function async with the record', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: LAMBDA_ARN },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.getLambdaFunction).toHaveBeenCalledWith('destFn')
    expect(ctx.lambdaInvokes).toHaveLength(1)
    expect(ctx.lambdaInvokes[0].options).toEqual({ async: true })
    expect(ctx.lambdaInvokes[0].event.requestContext.condition).toBe('Success')
    expect(ctx.lambdaInvokes[0].event.responsePayload).toEqual({ out: 2 })
  })

  test('a success result of undefined serializes as null', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: SQS_ARN },
      event: { in: 1 },
      result: undefined,
    })
    await tick()

    const record = JSON.parse(ctx.queueSends[0].message.body)
    expect(record.responsePayload).toBeNull()
  })

  test('an arn given as an object { arn } resolves like a string arn', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: { onSuccess: { arn: SNS_ARN } },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.snsPublishes).toHaveLength(1)
    expect(ctx.snsPublishes[0].topicArn).toBe(SNS_ARN)
  })

  test('an unrecognized destination arn is logged at debug and skipped', async () => {
    const ctx = makeRouter()
    await ctx.router.route({
      functionName: 'svc-dev-worker',
      functionArn: FUNCTION_ARN,
      destinations: {
        onSuccess: 'arn:aws:sqs:us-east-1:000000000000:not-provisioned',
      },
      event: { in: 1 },
      result: { out: 2 },
    })
    await tick()

    expect(ctx.queueSends).toHaveLength(0)
    expect(ctx.logger.debug).toHaveBeenCalled()
  })

  test('a sink rejection is swallowed and logged, never thrown to the caller', async () => {
    const logger = makeLogger()
    const ctx = makeRouter({
      logger,
      queueSend: () => Promise.reject(new Error('sink down')),
    })

    await expect(
      ctx.router.route({
        functionName: 'svc-dev-worker',
        functionArn: FUNCTION_ARN,
        destinations: { onSuccess: SQS_ARN },
        event: { in: 1 },
        result: { out: 2 },
      }),
    ).resolves.toBeUndefined()
    await tick()

    expect(logger.error).toHaveBeenCalled()
  })
})
