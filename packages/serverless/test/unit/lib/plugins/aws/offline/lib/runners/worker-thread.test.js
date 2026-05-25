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

  afterAll(async () => {
    await runner.terminate()
  })

  // 1. Happy path: async handler returns a value
  it('async handler returns a value', async () => {
    const handlerPath = await writeTmpHandler(
      'export async function handler(event) { return { ok: true, echo: event.x } }',
    )
    const result = await runner.invoke({
      functionKey: 'fn-1',
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
      functionKey: 'fn-2',
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
        functionKey: 'fn-3',
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
      functionKey: 'fn-4',
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
      functionKey: 'fn-5',
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
      functionKey: 'fn-5b',
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
      functionKey: 'fn-5c',
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
        functionKey: 'fn-6',
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
      functionKey: 'fn-7',
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
        functionKey: 'fn-8',
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      }),
    ).rejects.toMatchObject({ message: 'cb-fail' })
  })

  // 9. terminate() resolves without throwing
  it('terminate() resolves without throwing', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })
    await expect(r.terminate()).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Full Lambda context shape
  // -------------------------------------------------------------------------

  // 10. functionVersion defaults to '$LATEST'
  it('context includes functionVersion === "$LATEST" when not provided', async () => {
    const handlerPath = await writeTmpHandler(
      'export const handler = async (event, ctx) => ctx.functionVersion',
    )
    const result = await runner.invoke({
      functionKey: 'fn-10',
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
      functionKey: 'fn-11',
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
      functionKey: 'fn-12',
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
      functionKey: 'fn-13',
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
      functionKey: 'fn-14',
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
      functionKey: 'fn-15',
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
      functionKey: 'fn-16',
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
      functionKey: 'fn-17',
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
        functionKey: 'fn-18',
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
      functionKey: 'fn-19',
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
      functionKey: 'fn-20',
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
      functionKey: 'fn-21',
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
      functionKey: 'fn-22',
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
      functionKey: 'fn-23',
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
      functionKey: 'fn-24',
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
      functionKey: 'fn-25',
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

  // -------------------------------------------------------------------------
  // Pool-specific behaviour
  // -------------------------------------------------------------------------

  // Pool-1: Cold start — first invoke spawns a worker; second reuses it
  it('pool: second invoke on the same functionKey reuses the warm worker (no re-import)', async () => {
    // Use a handler with a module-level call counter. If the worker is reused,
    // the second invocation increments the same counter (returns 2).
    // If a fresh worker were spawned, it would return 1 again.
    const handlerPath = await writeTmpHandler(
      `let invocations = 0
       export const handler = async () => { invocations += 1; return invocations }`,
    )
    const opts = {
      functionKey: 'pool-1',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }
    const r1 = await runner.invoke(opts)
    const r2 = await runner.invoke(opts)
    // If the worker is reused, counters increment: 1, 2.
    expect(r1).toBe(1)
    expect(r2).toBe(2)
  })

  // Pool-2: Idle eviction — after terminateIdleLambdaTime, a fresh worker is spawned
  it('pool: idle eviction spawns a fresh worker after idle timeout', async () => {
    const r = createWorkerThreadRunner({
      servicePath: os.tmpdir(),
      terminateIdleLambdaTime: 0.05, // 50 ms
    })

    // Module-level counter: if the worker is reused it returns 2; if fresh it returns 1.
    const handlerPath = await writeTmpHandler(
      `let invocations = 0
       export const handler = async () => { invocations += 1; return invocations }`,
    )
    const opts = {
      functionKey: 'pool-2',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }

    const r1 = await r.invoke(opts)
    expect(r1).toBe(1)
    // Wait longer than the 50 ms eviction window.
    await new Promise((res) => setTimeout(res, 150))
    const r2 = await r.invoke(opts)

    // A fresh worker was spawned after eviction, so the counter resets to 1.
    expect(r2).toBe(1)

    await r.terminate()
  })

  // Pool-3: invalidate while idle — next invoke spins a fresh worker
  it('pool: invalidate() while idle causes next invoke to spawn a fresh worker', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Module-level counter: if the worker is reused it returns 2; if fresh it returns 1.
    const handlerPath = await writeTmpHandler(
      `let invocations = 0
       export const handler = async () => { invocations += 1; return invocations }`,
    )
    const opts = {
      functionKey: 'pool-3',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }

    const r1 = await r.invoke(opts)
    expect(r1).toBe(1)
    r.invalidate('pool-3')
    const r2 = await r.invoke(opts)

    // A fresh worker was spawned, so the counter resets to 1.
    expect(r2).toBe(1)

    await r.terminate()
  })

  // Pool-4: invalidate while busy — current invocation completes; next invoke is fresh
  it('pool: invalidate() while busy lets current invocation complete; next invoke is fresh', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Use a worker-scoped call counter to detect a fresh worker.
    // A fresh worker resets the counter to 0; the old worker increments it.
    const handlerPath = await writeTmpHandler(
      `let callCount = 0
       export const handler = async (event) => {
         callCount += 1
         // Simulate some work so the invocation is still in-flight when invalidate() runs.
         await new Promise(res => setTimeout(res, 50))
         return callCount
       }`,
    )
    const opts = {
      functionKey: 'pool-4',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }

    // Warm up the worker first so it is definitely in 'idle' state before the test.
    await r.invoke(opts)

    // Now start an invocation and immediately invalidate — the worker is warm,
    // so it will quickly transition to 'busy'. Wait just a tick to let the
    // postMessage reach the worker before we invalidate.
    const p2 = r.invoke(opts)
    await Promise.resolve() // yield to let the state machine advance
    r.invalidate('pool-4')

    // The in-flight invocation should still succeed (callCount goes to 2 on the old worker).
    const count2 = await p2
    expect(count2).toBe(2)

    // The next invocation should use a fresh worker (counter resets: 0 → 1).
    const count3 = await r.invoke(opts)
    expect(count3).toBe(1)

    await r.terminate()
  })

  // Pool-5: terminate() tears down all workers; next invoke spins fresh ones
  it('pool: terminate() tears down all workers; subsequent invoke spins a fresh worker', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Module-level counter: reused worker returns 2; fresh worker returns 1.
    const handlerPath = await writeTmpHandler(
      `let invocations = 0
       export const handler = async () => { invocations += 1; return invocations }`,
    )
    const optsA = {
      functionKey: 'pool-5a',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }
    const optsB = {
      functionKey: 'pool-5b',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }

    const r1a = await r.invoke(optsA)
    const r1b = await r.invoke(optsB)
    expect(r1a).toBe(1)
    expect(r1b).toBe(1)

    await r.terminate()

    // After terminate(), a new invoke should succeed with a fresh worker (counter resets).
    const r2a = await r.invoke(optsA)
    expect(r2a).toBe(1)
  })

  // Pool-6: terminate() is idempotent — second call does not throw
  it('pool: terminate() is idempotent', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => 42',
    )
    await r.invoke({
      functionKey: 'pool-6',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    })

    await expect(r.terminate()).resolves.toBeUndefined()
    await expect(r.terminate()).resolves.toBeUndefined()
  })

  // Pool-7: concurrent invocations on the same function are serialized
  it('pool: concurrent invocations on the same functionKey are serialized', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Handler appends to a shared sequence array.
    const handlerPath = await writeTmpHandler(
      `const seq = []
       export const handler = async (event) => {
         seq.push(event.n + ':start')
         await new Promise(res => setTimeout(res, 20))
         seq.push(event.n + ':end')
         return seq.slice()
       }`,
    )
    const invoke = (n) =>
      r.invoke({
        functionKey: 'pool-7',
        handlerPath,
        handlerName: 'handler',
        event: { n },
        context: {},
      })

    // Fire two invocations without awaiting between them.
    const [r1, r2] = await Promise.all([invoke(1), invoke(2)])

    // Invocation 1 must have fully completed before invocation 2 started.
    expect(r1).toEqual(['1:start', '1:end'])
    expect(r2).toEqual(['1:start', '1:end', '2:start', '2:end'])

    await r.terminate()
  })

  // Pool-8: handler error propagates and resets the worker to idle (reusable)
  it('pool: handler error propagates; worker remains usable for next invocation', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      `let call = 0
       export async function handler() {
         call += 1
         if (call === 1) throw new Error('first-fail')
         return 'second-ok'
       }`,
    )
    const opts = {
      functionKey: 'pool-8',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {},
    }

    await expect(r.invoke(opts)).rejects.toMatchObject({
      message: 'first-fail',
    })

    // Second invoke on the same worker should succeed.
    const result = await r.invoke(opts)
    expect(result).toBe('second-ok')

    await r.terminate()
  })

  // Pool-9: handler timeout terminates the worker; next invoke spins a fresh one
  it('pool: timeout terminates the worker; next invoke spawns a fresh worker', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Module-level counter: fresh worker resets to 0.
    const handlerPath = await writeTmpHandler(
      `let invocations = 0
       export const handler = async (event) => {
         invocations += 1
         if (event.slow) {
           await new Promise(res => setTimeout(res, 5000))
         }
         return invocations
       }`,
    )

    const err = await r
      .invoke({
        functionKey: 'pool-9',
        handlerPath,
        handlerName: 'handler',
        event: { slow: true },
        context: {},
        timeoutMs: 50,
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(ServerlessError)
    expect(err.code).toBe('OFFLINE_HANDLER_TIMEOUT')

    // After timeout, the pool entry was removed. A fresh invoke should succeed
    // and return 1 (fresh worker, counter reset).
    const r2 = await r.invoke({
      functionKey: 'pool-9',
      handlerPath,
      handlerName: 'handler',
      event: { slow: false },
      context: {},
    })
    expect(r2).toBe(1)

    await r.terminate()
  })

  // Pool-T1: terminate() while busy rejects the in-flight invocation
  it('pool: terminate() while busy rejects the in-flight invoke with OFFLINE_WORKER_TERMINATED', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      // Handler sleeps for 2 s — long enough for terminate() to race it.
      'export const handler = () => new Promise(res => setTimeout(res, 2000))',
    )

    // Attach a catch handler immediately so the rejection is never unhandled,
    // regardless of when terminate() fires relative to microtask scheduling.
    let capturedErr
    const invokePromise = r
      .invoke({
        functionKey: 'pool-t1',
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      .catch((e) => {
        capturedErr = e
      })

    // Yield briefly so the worker thread gets scheduled and state advances to
    // 'busy' (postMessage is delivered on the next tick after the promise
    // returned by invoke() is created).
    await new Promise((res) => setTimeout(res, 50))

    // Terminate the runner while the invocation is in-flight.
    await r.terminate()

    // Wait for the invoke promise to settle.
    await invokePromise

    expect(capturedErr).toBeInstanceOf(ServerlessError)
    expect(capturedErr.code).toBe('OFFLINE_WORKER_TERMINATED')
  })

  // -------------------------------------------------------------------------
  // callbackWaitsForEmptyEventLoop = false
  // -------------------------------------------------------------------------

  // CWFEL-1: handler sets flag to false + leaves a long setInterval pending —
  // invoke must resolve promptly, not hang until timeoutMs.
  it('callbackWaitsForEmptyEventLoop=false: callback resolves promptly even with pending setInterval', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // The setInterval would normally keep the event loop alive for 100 s,
    // but callbackWaitsForEmptyEventLoop = false must override that.
    const handlerPath = await writeTmpHandler(
      `export function handler(event, context, callback) {
         context.callbackWaitsForEmptyEventLoop = false
         setInterval(() => {}, 100000)
         callback(null, 'done')
       }`,
    )

    const start = Date.now()
    const result = await r.invoke({
      functionKey: 'cwfel-1',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'cwfelFn', awsRequestId: 'req-cwfel-1' },
      timeoutMs: 2000, // generous — should resolve well within this
    })
    const elapsed = Date.now() - start

    expect(result).toBe('done')
    // Must resolve within 500 ms — not after the 100 s interval or the 2 s timeout.
    expect(elapsed).toBeLessThan(500)

    // The entry should have been dropped from the pool; next invoke spawns fresh.
    const handlerPath2 = await writeTmpHandler(
      `let c = 0; export const handler = async () => { c += 1; return c }`,
    )
    const r2 = await r.invoke({
      functionKey: 'cwfel-1',
      handlerPath: handlerPath2,
      handlerName: 'handler',
      event: {},
      context: {},
    })
    // Fresh worker → counter resets to 1.
    expect(r2).toBe(1)

    await r.terminate()
  })

  // CWFEL-2: async/Promise handler with the same pending setInterval and flag=false —
  // must still resolve promptly when the promise resolves (flag has no effect on Promise path).
  it('callbackWaitsForEmptyEventLoop=false: async Promise handler still resolves promptly', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      `export async function handler(event, context) {
         context.callbackWaitsForEmptyEventLoop = false
         setInterval(() => {}, 100000)
         return 'promise-done'
       }`,
    )

    const start = Date.now()
    const result = await r.invoke({
      functionKey: 'cwfel-2',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'cwfelFn2', awsRequestId: 'req-cwfel-2' },
      timeoutMs: 2000,
    })
    const elapsed = Date.now() - start

    expect(result).toBe('promise-done')
    expect(elapsed).toBeLessThan(500)

    await r.terminate()
  })

  // CWFEL-3: default callbackWaitsForEmptyEventLoop=true — callback resolves,
  // worker is NOT exited, and is reused on the next invocation.
  it('callbackWaitsForEmptyEventLoop=true (default): worker is reused after callback resolves', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    // Module-level counter to detect worker reuse.
    const handlerPath = await writeTmpHandler(
      `let c = 0
       export function handler(event, context, callback) {
         c += 1
         // Default: callbackWaitsForEmptyEventLoop is true — do NOT set it false.
         callback(null, c)
       }`,
    )
    const opts = {
      functionKey: 'cwfel-3',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'cwfelFn3', awsRequestId: 'req-cwfel-3' },
    }

    const r1 = await r.invoke(opts)
    expect(r1).toBe(1)

    // Worker must be reused — counter increments (not reset to 1).
    const r2 = await r.invoke(opts)
    expect(r2).toBe(2)

    await r.terminate()
  })

  // Pool-10: AWS_LAMBDA_* envs are set per-invocation inside the worker
  it('pool: AWS_LAMBDA_* envs are refreshed on every invocation (not stuck to first)', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.AWS_LAMBDA_FUNCTION_NAME',
    )
    const invoke = (functionName) =>
      r.invoke({
        functionKey: 'pool-10',
        handlerPath,
        handlerName: 'handler',
        event: {},
        context: {
          functionName,
          awsRequestId: 'req-x',
          invokedFunctionArn: `arn:aws:lambda:us-east-1:000000000000:function:${functionName}`,
        },
      })

    const r1 = await invoke('FnFirst')
    const r2 = await invoke('FnSecond')

    // The env var must reflect the second invocation's context, not the first's.
    expect(r1).toBe('FnFirst')
    expect(r2).toBe('FnSecond')

    await r.terminate()
  })

  // -------------------------------------------------------------------------
  // Fix 7: missing AWS Lambda runtime env vars (#21)
  // -------------------------------------------------------------------------

  // ENV-1: process.env._HANDLER matches the handler string passed via context.
  it('env: _HANDLER is set from context.handler', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env._HANDLER',
    )
    const result = await r.invoke({
      functionKey: 'env-1',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'myFn',
        awsRequestId: 'req-env-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:myFn',
        handler: 'src/foo.handler',
      },
    })
    expect(result).toBe('src/foo.handler')

    await r.terminate()
  })

  // ENV-2: process.env.LAMBDA_TASK_ROOT is the AWS static value.
  it('env: LAMBDA_TASK_ROOT is set to /var/task', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.LAMBDA_TASK_ROOT',
    )
    const result = await r.invoke({
      functionKey: 'env-2',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn', awsRequestId: 'req-env-2' },
    })
    expect(result).toBe('/var/task')

    await r.terminate()
  })

  // ENV-3: process.env.LAMBDA_RUNTIME_DIR is the AWS static value.
  it('env: LAMBDA_RUNTIME_DIR is set to /var/runtime', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.LAMBDA_RUNTIME_DIR',
    )
    const result = await r.invoke({
      functionKey: 'env-3',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn', awsRequestId: 'req-env-3' },
    })
    expect(result).toBe('/var/runtime')

    await r.terminate()
  })

  // ENV-4: process.env.LANG is the AWS static value.
  it('env: LANG is set to en_US.UTF-8', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.LANG',
    )
    const result = await r.invoke({
      functionKey: 'env-4',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn', awsRequestId: 'req-env-4' },
    })
    expect(result).toBe('en_US.UTF-8')

    await r.terminate()
  })

  // ENV-5: process.env.LD_LIBRARY_PATH is the AWS-spec value.
  it('env: LD_LIBRARY_PATH is set to the AWS-spec value', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.LD_LIBRARY_PATH',
    )
    const result = await r.invoke({
      functionKey: 'env-5',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn', awsRequestId: 'req-env-5' },
    })
    expect(result).toBe(
      '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
    )

    await r.terminate()
  })

  // ENV-6: process.env.NODE_PATH is the AWS-spec value.
  it('env: NODE_PATH is set to the AWS-spec value', async () => {
    const r = createWorkerThreadRunner({ servicePath: os.tmpdir() })

    const handlerPath = await writeTmpHandler(
      'export const handler = async () => process.env.NODE_PATH',
    )
    const result = await r.invoke({
      functionKey: 'env-6',
      handlerPath,
      handlerName: 'handler',
      event: {},
      context: { functionName: 'myFn', awsRequestId: 'req-env-6' },
    })
    expect(result).toBe('/var/runtime:/var/task:/var/runtime/node_modules')

    await r.terminate()
  })
})
