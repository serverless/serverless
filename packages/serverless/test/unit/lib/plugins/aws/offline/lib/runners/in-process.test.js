import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInProcessRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/in-process.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers')

describe('createInProcessRunner', () => {
  it('returns an object with invoke + invalidate + terminate (worker-thread parity)', () => {
    const runner = createInProcessRunner()
    expect(typeof runner.invoke).toBe('function')
    expect(typeof runner.invalidate).toBe('function')
    expect(typeof runner.terminate).toBe('function')
  })

  it('invoke resolves to the handler return value (async handler)', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'echo',
      handlerPath: path.join(FIXTURES, 'sync-echo.mjs'),
      handlerName: 'handler',
      event: { x: 1 },
      context: {
        functionName: 'echo',
        awsRequestId: 'r-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:echo',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
      },
      environment: {},
    })
    expect(result).toEqual({ ok: true, echo: { x: 1 } })
  })

  it('does NOT leave AWS_LAMBDA_* polluted in process.env after invoke', async () => {
    const runner = createInProcessRunner()
    const priorFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME
    const priorMemorySize = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
    const priorHandler = process.env._HANDLER

    await runner.invoke({
      functionKey: 'echo',
      handlerPath: path.join(FIXTURES, 'sync-echo.mjs'),
      handlerName: 'handler',
      event: { x: 1 },
      context: {
        functionName: 'echo',
        awsRequestId: 'r-1',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:echo',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
        handler: 'src/echo.handler',
      },
      environment: { USER_VAR: 'user-value' },
    })

    expect(process.env.AWS_LAMBDA_FUNCTION_NAME).toBe(priorFunctionName)
    expect(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).toBe(priorMemorySize)
    expect(process.env._HANDLER).toBe(priorHandler)
    expect(process.env.USER_VAR).toBeUndefined()
  })

  it('handler sees AWS_LAMBDA_* + user env DURING the invocation', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'envEcho',
      handlerPath: path.join(FIXTURES, 'env-echo.mjs'),
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'envEcho',
        awsRequestId: 'r-2',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:envEcho',
        memoryLimitInMB: '256',
        timeoutMs: 6000,
        handler: 'src/envEcho.handler',
      },
      environment: { CUSTOM: 'hello' },
    })

    expect(result).toEqual({
      AWS_LAMBDA_FUNCTION_NAME: 'envEcho',
      AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '256',
      _HANDLER: 'src/envEcho.handler',
      CUSTOM: 'hello',
    })
  })

  it('restores env even when handler throws', async () => {
    const runner = createInProcessRunner()
    const priorFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME

    await expect(
      runner.invoke({
        functionKey: 'thrower',
        handlerPath: path.join(FIXTURES, 'thrower.mjs'),
        handlerName: 'handler',
        event: {},
        context: {
          functionName: 'thrower',
          awsRequestId: 'r-3',
          invokedFunctionArn:
            'arn:aws:lambda:us-east-1:000000000000:function:thrower',
          memoryLimitInMB: '128',
          timeoutMs: 6000,
          handler: 'src/thrower.handler',
        },
        environment: {},
      }),
    ).rejects.toThrow(/boom/)

    expect(process.env.AWS_LAMBDA_FUNCTION_NAME).toBe(priorFunctionName)
  })

  it('inflates context.getRemainingTimeInMillis()', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'remaining',
      handlerPath: path.join(FIXTURES, 'remaining.mjs'),
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'remaining',
        awsRequestId: 'r-4',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:remaining',
        memoryLimitInMB: '128',
        timeoutMs: 1000,
        handler: 'src/remaining.handler',
      },
      environment: {},
    })

    expect(result.remaining).toBeGreaterThan(0)
    expect(result.remaining).toBeLessThanOrEqual(1000)
  })

  it('exposes functionVersion, logGroupName and logStreamName on the context', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'ctx',
      handlerPath: path.join(FIXTURES, 'context-fields.mjs'),
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'ctx',
        awsRequestId: 'r-ctx',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:ctx',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
      },
      environment: {},
    })

    expect(result.functionVersion).toBe('$LATEST')
    expect(result.logGroupName).toBe('/aws/lambda/ctx')
    expect(result.logStreamName).toMatch(
      /^\d{4}\/\d{2}\/\d{2}\/\[\$LATEST\][0-9a-f]{32}$/,
    )
  })

  it('inflates legacy context.succeed / .fail / .done', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'legacySucceed',
      handlerPath: path.join(FIXTURES, 'legacy-succeed.mjs'),
      handlerName: 'handler',
      event: { msg: 'hi' },
      context: {
        functionName: 'legacySucceed',
        awsRequestId: 'r-5',
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:legacySucceed',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
        handler: 'src/legacySucceed.handler',
      },
      environment: {},
    })

    expect(result).toEqual({ via: 'succeed', echoed: 'hi' })
  })

  it('handles pure-callback handler (no return value)', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'cb',
      handlerPath: path.join(FIXTURES, 'callback-only.mjs'),
      handlerName: 'handler',
      event: { v: 42 },
      context: {
        functionName: 'cb',
        awsRequestId: 'r-cb',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:0:function:cb',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
        handler: 'src/cb.handler',
      },
      environment: {},
    })
    expect(result).toEqual({ via: 'callback', v: 42 })
  })

  it('callback error rejects the invoke promise', async () => {
    const runner = createInProcessRunner()
    await expect(
      runner.invoke({
        functionKey: 'cbErr',
        handlerPath: path.join(FIXTURES, 'callback-error.mjs'),
        handlerName: 'handler',
        event: {},
        context: {
          functionName: 'cbErr',
          awsRequestId: 'r-cbErr',
          invokedFunctionArn: 'arn:aws:lambda:us-east-1:0:function:cbErr',
          memoryLimitInMB: '128',
          timeoutMs: 6000,
          handler: 'src/cbErr.handler',
        },
        environment: {},
      }),
    ).rejects.toThrow(/cb-fail/)
  })

  it('handler that calls callback then resolves promise returns the callback value', async () => {
    const runner = createInProcessRunner()
    const result = await runner.invoke({
      functionKey: 'cbThenPromise',
      handlerPath: path.join(FIXTURES, 'callback-then-promise.mjs'),
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'cbThenPromise',
        awsRequestId: 'r-cbtp',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:0:function:cbThenPromise',
        memoryLimitInMB: '128',
        timeoutMs: 6000,
        handler: 'src/cbThenPromise.handler',
      },
      environment: {},
    })
    expect(result).toEqual({ via: 'callback-first' })
  })

  it('rejects with a timeout error when handler exceeds args.timeoutMs', async () => {
    const runner = createInProcessRunner()
    await expect(
      runner.invoke({
        functionKey: 'slow',
        handlerPath: path.join(FIXTURES, 'slow.mjs'),
        handlerName: 'handler',
        event: {},
        context: {
          functionName: 'slow',
          awsRequestId: 'r-slow',
          invokedFunctionArn: 'arn:aws:lambda:us-east-1:0:function:slow',
          memoryLimitInMB: '128',
          timeoutMs: 50,
          handler: 'src/slow.handler',
        },
        environment: {},
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/Task timed out/)
  })

  it('does NOT arm a timer when args.timeoutMs is undefined (--noTimeout parity)', async () => {
    const runner = createInProcessRunner()
    // Handler takes ~200ms; with no timeoutMs the runner must not abort it.
    const result = await runner.invoke({
      functionKey: 'slow',
      handlerPath: path.join(FIXTURES, 'slow.mjs'),
      handlerName: 'handler',
      event: {},
      context: {
        functionName: 'slow',
        awsRequestId: 'r-slow2',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:0:function:slow',
        memoryLimitInMB: '128',
        handler: 'src/slow.handler',
      },
      environment: {},
      // args.timeoutMs intentionally omitted
    })
    expect(result).toEqual({ slept: true })
  })
})
