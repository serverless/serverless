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
})
