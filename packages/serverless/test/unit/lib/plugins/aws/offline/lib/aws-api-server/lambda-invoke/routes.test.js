import { Buffer } from 'node:buffer'
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerLambdaInvokeRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/lambda-invoke/routes.js'

const SYNC_PATH = '/2015-03-31/functions/svc-dev-worker/invocations'
const ASYNC_LEGACY_PATH = '/2014-11-13/functions/svc-dev-worker/invoke-async'

/**
 * Build a stub function facade whose `invoke` records each call and resolves
 * or rejects per the configured behaviour.
 */
function makeFacade(behavior = {}) {
  const calls = []
  return {
    calls,
    invoke(event, options) {
      calls.push({ event, options })
      if (behavior.throw) {
        return Promise.reject(behavior.throw)
      }
      return Promise.resolve(behavior.result ?? { ok: true })
    },
  }
}

function makeLogger() {
  const errors = []
  return {
    errors,
    error(...args) {
      errors.push(args)
    },
  }
}

const nextTick = (ms = 10) => new Promise((r) => setTimeout(r, ms))

describe('registerLambdaInvokeRoutes', () => {
  let server

  beforeEach(() => {
    server = Hapi.server()
  })

  afterEach(async () => {
    await server.stop()
  })

  function register({ facade, logger } = {}) {
    const used = facade ?? makeFacade()
    registerLambdaInvokeRoutes(server, {
      getLambdaFunction: () => used,
      functionNameMap: new Map([['svc-dev-worker', 'worker']]),
      logger,
    })
    return used
  }

  test('sync invoke by deployed name returns the handler result', async () => {
    const facade = makeFacade({ result: { greeting: 'hi' } })
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      payload: Buffer.from(JSON.stringify({ name: 'world' }), 'utf8'),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ greeting: 'hi' })
    expect(res.headers['x-amz-executed-version']).toBe('$LATEST')
    expect(facade.calls).toHaveLength(1)
    expect(facade.calls[0].event).toEqual({ name: 'world' })
  })

  test('resolves the deployed name to the function key for getLambdaFunction', async () => {
    const facade = makeFacade()
    const keys = []
    registerLambdaInvokeRoutes(server, {
      getLambdaFunction: (key) => {
        keys.push(key)
        return facade
      },
      functionNameMap: new Map([['svc-dev-worker', 'worker']]),
    })
    await server.initialize()

    await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      payload: Buffer.from(JSON.stringify({}), 'utf8'),
    })

    expect(keys).toEqual(['worker'])
  })

  test('X-Amz-Invocation-Type: Event returns 202 and still invokes', async () => {
    const facade = makeFacade()
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      headers: { 'x-amz-invocation-type': 'Event' },
      payload: Buffer.from(JSON.stringify({ a: 1 }), 'utf8'),
    })

    expect(res.statusCode).toBe(202)
    expect(res.payload).toBe('')

    await nextTick()
    expect(facade.calls).toHaveLength(1)
    expect(facade.calls[0].event).toEqual({ a: 1 })
  })

  test('X-Amz-Invocation-Type: DryRun returns 400 InvalidParameterValueException and does not invoke', async () => {
    const facade = makeFacade()
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      headers: { 'x-amz-invocation-type': 'DryRun' },
      payload: Buffer.from(JSON.stringify({ a: 1 }), 'utf8'),
    })

    expect(res.statusCode).toBe(400)
    expect(res.headers['x-amzn-errortype']).toBe(
      'InvalidParameterValueException',
    )
    await nextTick()
    expect(facade.calls).toHaveLength(0)
  })

  test('legacy /invoke-async path returns 202 and invokes', async () => {
    const facade = makeFacade()
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: ASYNC_LEGACY_PATH,
      payload: Buffer.from(JSON.stringify({ a: 1 }), 'utf8'),
    })

    expect(res.statusCode).toBe(202)
    await nextTick()
    expect(facade.calls).toHaveLength(1)
  })

  test('unknown function name returns 404 ResourceNotFoundException', async () => {
    register()
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: '/2015-03-31/functions/does-not-exist/invocations',
      payload: Buffer.from(JSON.stringify({}), 'utf8'),
    })

    expect(res.statusCode).toBe(404)
    expect(res.headers['x-amzn-errortype']).toBe('ResourceNotFoundException')
    expect(JSON.parse(res.payload)).toMatchObject({ Type: 'User' })
  })

  test('sync handler throw returns 200 with X-Amz-Function-Error: Unhandled', async () => {
    const facade = makeFacade({ throw: new TypeError('boom') })
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      payload: Buffer.from(JSON.stringify({}), 'utf8'),
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['x-amz-function-error']).toBe('Unhandled')
    const body = JSON.parse(res.payload)
    expect(body.errorType).toBe('TypeError')
    expect(body.errorMessage).toBe('boom')
  })

  test('X-Amz-Client-Context base64 header is decoded and threaded into invoke', async () => {
    const facade = makeFacade()
    register({ facade })
    await server.initialize()

    const clientContext = { client: { app_title: 'demo' }, custom: { k: 'v' } }
    const header = Buffer.from(JSON.stringify(clientContext), 'utf8').toString(
      'base64',
    )

    await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      headers: { 'x-amz-client-context': header },
      payload: Buffer.from(JSON.stringify({}), 'utf8'),
    })

    expect(facade.calls).toHaveLength(1)
    expect(facade.calls[0].options.clientContext).toEqual(clientContext)
  })

  test('malformed body falls back to {} as the event', async () => {
    const facade = makeFacade()
    register({ facade })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      payload: Buffer.from('not json {', 'utf8'),
    })

    expect(res.statusCode).toBe(200)
    expect(facade.calls[0].event).toEqual({})
  })

  test('async invoke rejection is logged at error level (no unhandled rejection)', async () => {
    const facade = makeFacade({ throw: new Error('async boom') })
    const logger = makeLogger()
    register({ facade, logger })
    await server.initialize()

    const res = await server.inject({
      method: 'POST',
      url: SYNC_PATH,
      headers: { 'x-amz-invocation-type': 'Event' },
      payload: Buffer.from(JSON.stringify({}), 'utf8'),
    })

    expect(res.statusCode).toBe(202)
    await nextTick()
    expect(logger.errors.length).toBeGreaterThanOrEqual(1)
  })
})
