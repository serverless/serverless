import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'
import { Writable } from 'node:stream'
import { streamHandle } from 'hono/aws-lambda'

const { withoutBodyOnBodylessMethod } =
  await import('../../../../../../../lib/plugins/aws/mcp/entry/lib/event.mjs')

const restEvent = ({ httpMethod = 'POST', body = null, ...rest } = {}) => ({
  version: '1.0',
  httpMethod,
  path: '/crm/mcp',
  headers: {
    Host: 'abc123.execute-api.us-east-1.amazonaws.com',
    'Content-Length': '7',
    'content-type': 'application/json',
  },
  body,
  isBase64Encoded: false,
  requestContext: {
    domainName: 'abc123.execute-api.us-east-1.amazonaws.com',
    stage: 'dev',
  },
  ...rest,
})

describe('withoutBodyOnBodylessMethod', () => {
  it.each(['GET', 'HEAD', 'get'])(
    'drops the body and its stated length on %s',
    (httpMethod) => {
      const sanitized = withoutBodyOnBodylessMethod(
        restEvent({ httpMethod, body: 'ignored' }),
      )

      expect(sanitized.body).toBeNull()
      expect(sanitized.isBase64Encoded).toBe(false)
      expect(Object.keys(sanitized.headers)).not.toContain('Content-Length')
      // Everything else about the event is the event.
      expect(sanitized.path).toBe('/crm/mcp')
      expect(sanitized.headers['content-type']).toBe('application/json')
    },
  )

  it('strips a multi-value content-length too', () => {
    const sanitized = withoutBodyOnBodylessMethod(
      restEvent({
        httpMethod: 'GET',
        body: 'ignored',
        multiValueHeaders: { 'content-length': ['7'], 'x-trace': ['one'] },
      }),
    )

    expect(sanitized.multiValueHeaders).toEqual({ 'x-trace': ['one'] })
  })

  it('reads the method of a payload v2 event', () => {
    const sanitized = withoutBodyOnBodylessMethod({
      version: '2.0',
      rawPath: '/crm/mcp',
      body: 'ignored',
      headers: { 'content-length': '7' },
      requestContext: { http: { method: 'GET' } },
    })

    expect(sanitized.body).toBeNull()
    expect(sanitized.headers).toEqual({})
  })

  it('hands back a body-carrying method untouched', () => {
    const event = restEvent({ body: '{"a":1}' })

    expect(withoutBodyOnBodylessMethod(event)).toBe(event)
  })

  it('hands back an event with no body untouched', () => {
    const event = restEvent({ httpMethod: 'GET' })

    expect(withoutBodyOnBodylessMethod(event)).toBe(event)
  })
})

const fakeStream = () => {
  const chunks = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  })
  stream.chunks = chunks
  return stream
}

describe('hono streamHandle', () => {
  let errorLog

  beforeEach(() => {
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.awslambda = {
      streamifyResponse: (fn) => {
        fn[Symbol.for('aws.lambda.runtime.handler.streaming')] = 'response'
        return fn
      },
      HttpResponseStream: {
        from: (stream, metadata) => {
          // `from()` writes nothing itself: it installs the hook that emits the
          // prelude from inside the *first* `write()`, and `end()` never
          // flushes it. Modelled that way, `stream.metadata` is set exactly
          // when a real client would have seen a status line.
          const write = stream.write.bind(stream)
          stream.write = (...args) => {
            if (stream.metadata === undefined) stream.metadata = metadata
            return write(...args)
          }
          return stream
        },
      },
    }
  })

  afterEach(() => {
    errorLog.mockRestore()
    delete globalThis.awslambda
  })

  // The reason `event.mjs` exists, pinned against the adapter it corrects
  // rather than against a description of it: `EventProcessor#createRequest`
  // passes `event.body` into `new Request` whenever it is set, with no regard
  // for the method, and undici refuses a body on GET/HEAD outright. API Gateway
  // does deliver such requests, and the MCP route is registered as ANY, so
  // without the correction the throw is caught by `streamHandle` itself — which
  // answers with no prelude at all, reaching the client as a 200 carrying error
  // text.
  describe('on a GET carrying a body', () => {
    const app = { fetch: async () => new Response('ok', { status: 200 }) }

    it('fails the request when the event is passed through unchanged', async () => {
      const stream = fakeStream()

      await streamHandle(app)(
        restEvent({ httpMethod: 'GET', body: 'ignored' }),
        stream,
        {},
      )

      expect(stream.metadata).toBeUndefined()
      expect(Buffer.concat(stream.chunks).toString()).toBe(
        'Internal Server Error',
      )
      expect(errorLog).toHaveBeenCalled()
    })

    it.each(['GET', 'HEAD'])(
      'serves the request when the %s event is corrected first',
      async (httpMethod) => {
        const stream = fakeStream()

        await streamHandle(app)(
          withoutBodyOnBodylessMethod(
            restEvent({ httpMethod, body: 'ignored' }),
          ),
          stream,
          {},
        )

        expect(stream.metadata.statusCode).toBe(200)
        expect(Buffer.concat(stream.chunks).toString()).toBe('ok')
        expect(errorLog).not.toHaveBeenCalled()
      },
    )
  })

  // Inherited behavior the entry depends on, so it is pinned here rather than
  // assumed: MCP answers the mandatory `notifications/initialized` with 202 and
  // no body, and the prelude is what carries that status. Since the runtime
  // emits the prelude from inside the first `write()` and `end()` never does, a
  // response that writes nothing would reach the client as zero bytes — the
  // client would see no reply and never open the standalone SSE stream that
  // elicitation needs. `streamHandle` writes one empty chunk for exactly this.
  it('flushes the prelude of a body-less response', async () => {
    const stream = fakeStream()
    const app = { fetch: async () => new Response(null, { status: 202 }) }

    await streamHandle(app)(restEvent(), stream, {})

    expect(stream.metadata).toEqual({
      statusCode: 202,
      headers: {},
      cookies: [],
    })
    expect(stream.writableEnded).toBe(true)
  })
})
