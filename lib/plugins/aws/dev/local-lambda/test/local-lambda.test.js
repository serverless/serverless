const path = require('path')
const LocalLambda = require('..')

const context = {
  functionName: 'test-lambda',
  functionVersion: '$LATEST',
  memoryLimitInMB: '1024',
  logGroupName: '/aws/lambda/test-lambda',
  logStreamName: '2024/03/27/[$LATEST]c1c2c943f42c4038a764938980b95d99',
  invokedFunctionArn:
    'arn:aws:lambda:us-east-1:552750238299:function:test-lambda',
  awsRequestId: 'e70aeb5a-f349-4af5-b22e-defc21581de3',
  callbackWaitsForEmptyEventLoop: true,
}

describe('.js functions', () => {
  it('should invoke and return the response', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.hello',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'Hello',
      },
      error: null,
    })
  })

  it('should pass the event to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.event',
      runtime: 'nodejs20.x',
    })

    const event = {
      foo: 'bar',
    }

    const result = await localLambda.invoke(event)

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: event,
      },
      error: null,
    })
  })

  it('should pass the environment to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.environment',
      runtime: 'nodejs20.x',
      environment: {
        FOO: 'BAR',
      },
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'BAR',
      },
      error: null,
    })
  })

  it('should pass the context to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.context',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({}, context)

    expect(result.response).toMatchObject(context)
  })

  it('should pass the callback to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.callback',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.response).toEqual('Hello')
  })

  it('should not reject in case of errors', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    await expect(localLambda.invoke()).resolves.not.toThrow()
  })

  it('should return error information', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'js'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.error.name).toEqual('Error')
    expect(result.error.message).toEqual('This error should not fail the test')
    expect(result.error.stack).toBeDefined()
  })
})

describe('.cjs functions', () => {
  it('should invoke and return the response', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.hello',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'Hello',
      },
      error: null,
    })
  })

  it('should pass the event to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.event',
      runtime: 'nodejs20.x',
    })

    const event = {
      foo: 'bar',
    }

    const result = await localLambda.invoke(event)

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: event,
      },
      error: null,
    })
  })

  it('should pass the environment to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.environment',
      runtime: 'nodejs20.x',
      environment: {
        FOO: 'BAR',
      },
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'BAR',
      },
      error: null,
    })
  })

  it('should pass the context to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.context',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({}, context)

    expect(result.response).toMatchObject(context)
  })

  it('should pass the callback to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.callback',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.response).toEqual('Hello')
  })

  it('should not reject in case of errors', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    await expect(localLambda.invoke()).resolves.not.toThrow()
  })

  it('should return error information', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'cjs'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.error.name).toEqual('Error')
    expect(result.error.message).toEqual('This error should not fail the test')
    expect(result.error.stack).toBeDefined()
  })
})

describe('.mjs functions', () => {
  it('should invoke and return response', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.hello',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({})

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'Hello',
      },
      error: null,
    })
  })

  it('should pass the event to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.event',
      runtime: 'nodejs20.x',
    })

    const event = {
      foo: 'bar',
    }

    const result = await localLambda.invoke(event)

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: event,
      },
      error: null,
    })
  })

  it('should pass the environment to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.environment',
      runtime: 'nodejs20.x',
      environment: {
        FOO: 'BAR',
      },
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'BAR',
      },
      error: null,
    })
  })

  it('should pass the context to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.context',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({}, context)

    expect(result.response).toMatchObject(context)
  })

  it('should should not reject in case of errors', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    await expect(localLambda.invoke()).resolves.not.toThrow()
  })

  it('should pass the callback to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.callback',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.response).toEqual('Hello')
  })

  it('should return error information', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'mjs'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.error.name).toEqual('Error')
    expect(result.error.message).toEqual('This error should not fail the test')
    expect(result.error.stack).toBeDefined()
  })
})

describe('.ts functions', () => {
  it('should invoke and return the response', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.hello',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({})

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'Hello',
      },
      error: null,
    })
  })

  it('should pass the event to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.event',
      runtime: 'nodejs20.x',
    })

    const event = {
      foo: 'bar',
    }

    const result = await localLambda.invoke(event)

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: event,
      },
      error: null,
    })
  })

  it('should pass the environment to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.environment',
      runtime: 'nodejs20.x',
      environment: {
        FOO: 'BAR',
      },
    })

    const result = await localLambda.invoke()

    expect(result).toEqual({
      response: {
        statusCode: 200,
        body: 'BAR',
      },
      error: null,
    })
  })

  it('should pass the context to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.context',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke({}, context)

    expect(result.response).toMatchObject(context)
  })

  it('should pass the callback to the handler', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.callback',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.response).toEqual('Hello')
  })

  it('should should not reject in case of errors', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    await expect(localLambda.invoke()).resolves.not.toThrow()
  })

  it('should return error information', async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: path.resolve(__dirname, 'handlers', 'ts'),
      handler: 'handlers.error',
      runtime: 'nodejs20.x',
    })

    const result = await localLambda.invoke()

    expect(result.error.name).toEqual('Error')
    expect(result.error.message).toEqual('This error should not fail the test')
    expect(result.error.stack).toBeDefined()
  })
})
