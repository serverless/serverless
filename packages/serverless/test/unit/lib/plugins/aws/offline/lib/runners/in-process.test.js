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
})
