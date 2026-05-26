import { jest } from '@jest/globals'
import { buildLambdaRuntimeEnv } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/lambda-env.js'

describe('buildLambdaRuntimeEnv', () => {
  const baseContext = {
    functionName: 'my-fn',
    memoryLimitInMB: '512',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:my-fn:$LATEST',
    logGroupName: '/aws/lambda/my-fn',
    logStreamName: '2026/05/26/[$LATEST]abcdef0123456789',
    handler: 'src/foo.handler',
    region: 'us-east-1',
  }

  it('returns AWS_LAMBDA_* vars from the context fields', () => {
    const env = buildLambdaRuntimeEnv(baseContext)
    expect(env.AWS_LAMBDA_FUNCTION_NAME).toBe('my-fn')
    expect(env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).toBe('512')
    expect(env.AWS_LAMBDA_FUNCTION_VERSION).toBe('$LATEST')
    expect(env.AWS_LAMBDA_INVOKED_FUNCTION_ARN).toBe(
      'arn:aws:lambda:us-east-1:123456789012:function:my-fn:$LATEST',
    )
    expect(env.AWS_LAMBDA_LOG_GROUP_NAME).toBe('/aws/lambda/my-fn')
    expect(env.AWS_LAMBDA_LOG_STREAM_NAME).toBe(
      '2026/05/26/[$LATEST]abcdef0123456789',
    )
    expect(env.AWS_REGION).toBe('us-east-1')
    expect(env.AWS_DEFAULT_REGION).toBe('us-east-1')
    expect(env._HANDLER).toBe('src/foo.handler')
  })

  it('returns the static Lambda container constants verbatim', () => {
    const env = buildLambdaRuntimeEnv(baseContext)
    expect(env.LAMBDA_TASK_ROOT).toBe('/var/task')
    expect(env.LAMBDA_RUNTIME_DIR).toBe('/var/runtime')
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.LD_LIBRARY_PATH).toBe(
      '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
    )
    expect(env.NODE_PATH).toBe(
      '/var/runtime:/var/task:/var/runtime/node_modules',
    )
  })

  it('omits _HANDLER when context.handler is undefined', () => {
    const { handler, ...withoutHandler } = baseContext
    const env = buildLambdaRuntimeEnv(withoutHandler)
    expect('_HANDLER' in env).toBe(false)
  })

  it('does NOT mutate process.env', () => {
    const before = { ...process.env }
    buildLambdaRuntimeEnv(baseContext)
    expect(process.env).toEqual(before)
  })
})
