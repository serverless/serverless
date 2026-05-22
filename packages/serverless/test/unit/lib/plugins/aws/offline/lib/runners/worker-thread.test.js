import os from 'node:os'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { createWorkerThreadRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/worker-thread.js'
import ServerlessError from '../../../../../../../../lib/serverless-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpFiles = []

/**
 * Write a temporary .mjs handler file and return its absolute path.
 * The .mjs extension ensures dynamic import() treats it as ESM regardless
 * of the parent package.json "type" field.
 */
async function writeTmpHandler(source) {
  const filePath = path.join(
    os.tmpdir(),
    `worker-thread-test-${crypto.randomUUID()}.mjs`,
  )
  await fs.promises.writeFile(filePath, source, 'utf8')
  tmpFiles.push(filePath)
  return filePath
}

afterAll(async () => {
  await Promise.all(tmpFiles.map((f) => fs.promises.rm(f, { force: true })))
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWorkerThreadRunner', () => {
  let runner

  beforeAll(() => {
    runner = createWorkerThreadRunner({ servicePath: os.tmpdir() })
  })

  // 1. Happy path: async handler returns a value
  it('async handler returns a value', async () => {
    const handlerPath = await writeTmpHandler(
      'export async function handler(event) { return { ok: true, echo: event.x } }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: { x: 42 },
      context: {},
    })
    expect(result).toEqual({ ok: true, echo: 42 })
  })

  // 2. Sync handler returns a value
  it('sync handler returns a value', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event) { return event.x }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: { x: 'sync' },
      context: {},
    })
    expect(result).toBe('sync')
  })

  // 3. Handler throws — error propagates with stack
  it('handler throws — error propagates with stack', async () => {
    const handlerPath = await writeTmpHandler(
      "export async function handler() { throw new Error('boom') }",
    )
    await expect(
      runner.invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      }),
    ).rejects.toMatchObject({
      message: 'boom',
      stack: expect.stringMatching(/\S/),
    })
  })

  // 4. Environment variables visible inside the worker
  it('environment variables are visible inside the worker', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.FOO',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
      environment: { FOO: 'bar' },
    })
    expect(result).toBe('bar')
  })

  // 5. Lambda context is passed
  it('Lambda context is passed to the handler', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, context) => context.functionName',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn' },
    })
    expect(result).toBe('myFn')
  })

  // 5b. deadlineMs is inflated into getRemainingTimeInMillis in the worker
  it('deadlineMs is inflated into getRemainingTimeInMillis inside the worker', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, context) => ({' +
        '  type: typeof context.getRemainingTimeInMillis,' +
        '  value: context.getRemainingTimeInMillis(),' +
        '})',
    )
    const deadlineMs = Date.now() + 60000
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { deadlineMs },
    })
    expect(result.type).toBe('function')
    expect(result.value).toBeGreaterThan(0)
    expect(result.value).toBeLessThanOrEqual(60000)
  })

  // 5c. getRemainingTimeInMillis returns 0 when deadlineMs is absent
  it('getRemainingTimeInMillis returns 0 when deadlineMs is absent', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, context) => context.getRemainingTimeInMillis()',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    })
    expect(result).toBe(0)
  })

  // 6. Timeout
  it('rejects with ServerlessError OFFLINE_HANDLER_TIMEOUT when the handler exceeds timeoutMs', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = () => new Promise(r => setTimeout(r, 5000))',
    )
    const err = await runner
      .invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
        timeoutMs: 50,
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(ServerlessError)
    expect(err.code).toBe('OFFLINE_HANDLER_TIMEOUT')
  })

  // 7. Callback-style handler returns success via callback(null, result)
  it('callback-style handler — success path', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event, context, callback) { callback(null, { ok: true }) }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    })
    expect(result).toEqual({ ok: true })
  })

  // 8. Callback-style handler returns failure via callback(err)
  it('callback-style handler — failure path', async () => {
    const handlerPath = await writeTmpHandler(
      "export function handler(event, context, callback) { callback(new Error('cb-fail')) }",
    )
    await expect(
      runner.invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      }),
    ).rejects.toMatchObject({ message: 'cb-fail' })
  })

  // 9. terminate() is a no-op
  it('terminate() resolves without throwing', async () => {
    await expect(runner.terminate()).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // M1-T5: Full Lambda context shape
  // -------------------------------------------------------------------------

  // 10. functionVersion defaults to '$LATEST'
  it('context includes functionVersion === "$LATEST" when not provided', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ctx.functionVersion',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('$LATEST')
  })

  // 11. memoryLimitInMB is a string
  it('context includes memoryLimitInMB as a STRING', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ({ val: ctx.memoryLimitInMB, type: typeof ctx.memoryLimitInMB })',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
        memoryLimitInMB: 256,
      },
    })
    expect(result.val).toBe('256')
    expect(result.type).toBe('string')
  })

  // 12. memoryLimitInMB defaults to '1024' when not provided
  it('context memoryLimitInMB defaults to "1024" string when not provided', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ctx.memoryLimitInMB',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('1024')
  })

  // 13. logGroupName defaults to /aws/lambda/<functionName>
  it('context includes logGroupName defaulting to /aws/lambda/<functionName>', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ctx.logGroupName',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('/aws/lambda/myFn')
  })

  // 14. logStreamName matches expected format
  it('context includes logStreamName matching YYYY/MM/DD/[$LATEST]<hex>', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ctx.logStreamName',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}\/\[\$LATEST\][0-9a-f]+$/)
  })

  // 15. identity and clientContext are null
  it('context includes identity: null and clientContext: null', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ({ identity: ctx.identity, clientContext: ctx.clientContext })',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result.identity).toBeNull()
    expect(result.clientContext).toBeNull()
  })

  // 16. context.done(null, value) posts a success message
  it('context.done(null, value) resolves the invocation with that value', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event, context) { context.done(null, { legacy: true }) }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toEqual({ legacy: true })
  })

  // 17. context.succeed(value) resolves the invocation
  it('context.succeed(value) resolves the invocation with that value', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event, context) { context.succeed({ via: "succeed" }) }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toEqual({ via: 'succeed' })
  })

  // 18. context.fail(error) rejects the invocation
  it('context.fail(error) rejects the invocation with that error', async () => {
    const handlerPath = await writeTmpHandler(
      "export function handler(event, context) { context.fail(new Error('ctx-fail')) }",
    )
    await expect(
      runner.invoke({
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {
          functionName: 'myFn',
          awsRequestId: 'req-1',
          invokedFunctionArn:
            'arn:aws:lambda:us-east-1:000000000000:function:myFn',
        },
      }),
    ).rejects.toMatchObject({ message: 'ctx-fail' })
  })

  // 19. Only first settle wins — context.done called twice should only resolve once
  it('calling done twice only settles once (first call wins)', async () => {
    const handlerPath = await writeTmpHandler(
      'export function handler(event, context) { context.done(null, "first"); context.done(null, "second") }',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('first')
  })

  // 20. AWS_LAMBDA_FUNCTION_NAME visible inside the worker
  it('AWS_LAMBDA_FUNCTION_NAME env var is visible inside the handler', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_FUNCTION_NAME',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myLambdaFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myLambdaFn',
      },
    })
    expect(result).toBe('myLambdaFn')
  })

  // 21. AWS_LAMBDA_FUNCTION_MEMORY_SIZE env var
  it('AWS_LAMBDA_FUNCTION_MEMORY_SIZE env var matches memoryLimitInMB string', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
        memoryLimitInMB: 512,
      },
    })
    expect(result).toBe('512')
  })

  // 22. AWS_LAMBDA_FUNCTION_VERSION is '$LATEST'
  it('AWS_LAMBDA_FUNCTION_VERSION env var is "$LATEST"', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_FUNCTION_VERSION',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('$LATEST')
  })

  // 23. AWS_LAMBDA_INVOKED_FUNCTION_ARN matches invokedFunctionArn
  it('AWS_LAMBDA_INVOKED_FUNCTION_ARN matches invokedFunctionArn context field', async () => {
    const arn = 'arn:aws:lambda:us-east-1:000000000000:function:myFn'
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_INVOKED_FUNCTION_ARN',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn: arn,
      },
    })
    expect(result).toBe(arn)
  })

  // 24. AWS_LAMBDA_LOG_GROUP_NAME matches expected default
  it('AWS_LAMBDA_LOG_GROUP_NAME env var matches /aws/lambda/<functionName>', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_LOG_GROUP_NAME',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toBe('/aws/lambda/myFn')
  })

  // 25. AWS_LAMBDA_LOG_STREAM_NAME matches expected format
  it('AWS_LAMBDA_LOG_STREAM_NAME env var matches YYYY/MM/DD/[$LATEST]<hex> format', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_LOG_STREAM_NAME',
    )
    const result = await runner.invoke({
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
      },
    })
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}\/\[\$LATEST\][0-9a-f]+$/)
  })
})
