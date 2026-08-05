import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'
import { Writable } from 'node:stream'

const { lambdaRequest, respondWithStream, streamHandler } =
  await import('../../../../../../../lib/plugins/aws/mcp/entry/lib/pump.mjs')

// `awslambda` is the streaming runtime's own global, modelled here the way the
// real one behaves: `from()` does not write anything, it only installs the
// `_onBeforeFirstWrite` hook that emits the prelude — the metadata JSON and its
// NUL delimiter — from inside the *first* `write()`. `end()` never flushes it,
// so a response that writes nothing puts zero bytes on the wire. The double
// therefore records the metadata on the first write and not before, and reports
// whether the prelude was flushed at all.
const installAwsLambdaGlobal = () => {
  const prelude = { metadata: undefined, wrapped: 0, flushed: false }
  globalThis.awslambda = {
    streamifyResponse: (fn) => {
      fn.__streamified = true
      return fn
    },
    HttpResponseStream: {
      from: (stream, metadata) => {
        prelude.wrapped += 1
        const write = stream.write.bind(stream)
        stream.write = (...args) => {
          if (!prelude.flushed) {
            prelude.flushed = true
            prelude.metadata = metadata
          }
          return write(...args)
        }
        return stream
      },
    },
  }
  return prelude
}

/**
 * A real Writable, so backpressure is the platform's and not a mock's:
 * `highWaterMark: 1` means the first write of any real chunk fills the buffer
 * and `write()` answers false until the sink calls back.
 */
const blockingStream = () => {
  const chunks = []
  const callbacks = []
  let flowing = false
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      if (flowing) callback()
      else callbacks.push(callback)
    },
  })
  return {
    stream,
    chunks,
    get text() {
      return Buffer.concat(chunks).toString()
    },
    // The client starts reading: pending writes complete (which is what emits
    // 'drain') and everything after them goes straight through.
    unblock() {
      flowing = true
      while (callbacks.length) callbacks.shift()()
    },
  }
}

const freeStream = () => {
  const chunks = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  })
  return {
    stream,
    get text() {
      return Buffer.concat(chunks).toString()
    },
  }
}

const restEvent = ({
  path = '/crm/mcp',
  httpMethod = 'POST',
  body = null,
  ...rest
} = {}) => ({
  version: '1.0',
  httpMethod,
  path,
  headers: {
    Host: 'abc123.execute-api.us-east-1.amazonaws.com',
    'content-type': 'application/json',
  },
  body,
  isBase64Encoded: false,
  requestContext: {
    domainName: 'abc123.execute-api.us-east-1.amazonaws.com',
    stage: 'dev',
    path: `/dev${path}`,
  },
  ...rest,
})

/** An app-shaped object: the responder only ever calls `fetch`. */
const fakeApp = (respond) => {
  const calls = []
  return {
    calls,
    fetch(request, env) {
      calls.push({ request, env })
      return respond(request, env)
    },
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('lambdaRequest', () => {
  it('builds the URL from the API Gateway domain and path', () => {
    expect(lambdaRequest({ event: restEvent() }).url).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
    )
  })

  it('re-encodes a payload v1 query string', () => {
    const request = lambdaRequest({
      event: restEvent({
        queryStringParameters: { 'a b': 'c&d' },
      }),
    })
    expect(request.url).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp?a%20b=c%26d',
    )
  })

  it('expands multi-value query parameters', () => {
    const request = lambdaRequest({
      event: restEvent({
        multiValueQueryStringParameters: { select: ['amount', 'currency'] },
      }),
    })
    expect(new URL(request.url).search).toBe('?select=amount&select=currency')
  })

  it('reads a payload v2 raw path, method and query string', () => {
    const request = lambdaRequest({
      event: {
        version: '2.0',
        rawPath: '/crm/mcp',
        rawQueryString: 'a=1',
        headers: { host: 'abc.lambda-url.us-east-1.on.aws' },
        requestContext: {
          domainName: 'abc.lambda-url.us-east-1.on.aws',
          http: { method: 'DELETE', path: '/crm/mcp' },
        },
      },
    })
    expect(request.method).toBe('DELETE')
    expect(request.url).toBe(
      'https://abc.lambda-url.us-east-1.on.aws/crm/mcp?a=1',
    )
  })

  it('falls back to the Host header when the event has no domain name', () => {
    const event = restEvent()
    delete event.requestContext.domainName
    expect(lambdaRequest({ event }).url).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
    )
  })

  it('carries single- and multi-value headers through', () => {
    const request = lambdaRequest({
      event: restEvent({
        multiValueHeaders: { 'x-trace': ['one', 'two'] },
      }),
    })
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.headers.get('x-trace')).toBe('one, two')
  })

  it('reads a plain body and states its length', async () => {
    const request = lambdaRequest({ event: restEvent({ body: '{"a":1}' }) })
    expect(await request.text()).toBe('{"a":1}')
    expect(request.headers.get('content-length')).toBe('7')
  })

  it('decodes a base64 body', async () => {
    const request = lambdaRequest({
      event: restEvent({
        body: Buffer.from('{"a":1}').toString('base64'),
        isBase64Encoded: true,
      }),
    })
    expect(await request.text()).toBe('{"a":1}')
  })

  it('joins payload v2 cookies into a Cookie header', () => {
    const request = lambdaRequest({
      event: {
        version: '2.0',
        rawPath: '/crm/mcp',
        rawQueryString: '',
        cookies: ['a=1', 'b=2'],
        headers: { host: 'example.com' },
        requestContext: {
          domainName: 'example.com',
          http: { method: 'GET', path: '/crm/mcp' },
        },
      },
    })
    expect(request.headers.get('cookie')).toBe('a=1; b=2')
  })

  it('carries the abort signal it was given', () => {
    const controller = new AbortController()
    const request = lambdaRequest({
      event: restEvent(),
      signal: controller.signal,
    })
    expect(request.signal.aborted).toBe(false)
    controller.abort()
    expect(request.signal.aborted).toBe(true)
  })
})

describe('respondWithStream', () => {
  let prelude
  let errorLog

  beforeEach(() => {
    prelude = installAwsLambdaGlobal()
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorLog.mockRestore()
    delete globalThis.awslambda
  })

  it('sends the status and headers as prelude metadata before the body', async () => {
    const sink = freeStream()
    const app = fakeApp(
      () =>
        new Response('hello', {
          status: 202,
          headers: { 'content-type': 'text/plain' },
        }),
    )
    await respondWithStream(app)(restEvent(), sink.stream, {})

    expect(prelude.metadata).toMatchObject({
      statusCode: 202,
      headers: { 'content-type': 'text/plain' },
      cookies: [],
    })
    expect(sink.text).toBe('hello')
  })

  it('collects set-cookie headers into the prelude cookies', async () => {
    const sink = freeStream()
    const headers = new Headers()
    headers.append('set-cookie', 'a=1')
    headers.append('set-cookie', 'b=2')
    await respondWithStream(fakeApp(() => new Response('x', { headers })))(
      restEvent(),
      sink.stream,
      {},
    )

    expect(prelude.metadata.cookies).toEqual(['a=1', 'b=2'])
    expect(prelude.metadata.headers['set-cookie']).toBeUndefined()
  })

  it('passes the event, request context and Lambda context as the app environment', async () => {
    const sink = freeStream()
    const app = fakeApp(() => new Response('x'))
    const event = restEvent()
    const context = { awsRequestId: 'req-1' }
    await respondWithStream(app)(event, sink.stream, context)

    // `compose.mjs` reads `c.env.event`, so this shape is load-bearing.
    expect(app.calls[0].env).toEqual({
      event,
      requestContext: event.requestContext,
      context,
    })
  })

  it('ends the stream on a body-less response', async () => {
    const sink = freeStream()
    await respondWithStream(fakeApp(() => new Response(null, { status: 204 })))(
      restEvent(),
      sink.stream,
      {},
    )
    expect(prelude.metadata.statusCode).toBe(204)
    expect(sink.stream.writableEnded).toBe(true)
  })

  // MCP answers the mandatory `notifications/initialized` with 202 and no body,
  // and the prelude is what carries that status. Since the runtime emits the
  // prelude from inside the first `write()` and `end()` never does, a response
  // that writes nothing reaches the client as zero bytes: the client sees no
  // reply, and never opens the standalone SSE stream that elicitation needs.
  it('writes an empty chunk so a body-less response flushes its prelude', async () => {
    const sink = freeStream()
    await respondWithStream(fakeApp(() => new Response(null, { status: 202 })))(
      restEvent(),
      sink.stream,
      {},
    )
    expect(prelude.flushed).toBe(true)
    expect(prelude.metadata.statusCode).toBe(202)
  })

  it('answers a 500 prelude when the app throws', async () => {
    const sink = freeStream()
    await respondWithStream(
      fakeApp(() => {
        throw new Error('boom')
      }),
    )(restEvent(), sink.stream, {})

    expect(prelude.metadata.statusCode).toBe(500)
    expect(sink.text).toContain('Internal Server Error')
    expect(errorLog).toHaveBeenCalled()
  })

  // The finding: hono's own bridge ignores what `write()` returns
  // (`hono/src/adapter/aws-lambda/handler.ts:132`), so a client slower than the
  // handler grows the Lambda's memory instead of slowing the handler down.
  it('waits for drain instead of writing through a full buffer', async () => {
    const sink = blockingStream()
    const pulled = []
    const body = new ReadableStream({
      pull(controller) {
        pulled.push(pulled.length)
        controller.enqueue(new TextEncoder().encode(`chunk-${pulled.length}`))
        if (pulled.length === 3) controller.close()
      },
    })
    const done = respondWithStream(fakeApp(() => new Response(body)))(
      restEvent(),
      sink.stream,
      {},
    )

    // The first write saturates a highWaterMark of 1, so nothing more may be
    // read from the body until the sink drains.
    await tick()
    expect(sink.chunks).toHaveLength(1)
    expect(pulled.length).toBeLessThanOrEqual(2)

    sink.unblock()
    await done
    expect(sink.text).toBe('chunk-1chunk-2chunk-3')
  })

  // The finding: hono's bridge never ties the response stream to the Request,
  // so a client that hangs up leaves the MCP handler running to the timeout.
  it('aborts the request and cancels the body when the client disconnects', async () => {
    const sink = blockingStream()
    let cancelled
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'))
      },
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('more'))
      },
      cancel(reason) {
        cancelled = reason ?? 'cancelled'
      },
    })
    const app = fakeApp(() => new Response(body))
    const done = respondWithStream(app)(restEvent(), sink.stream, {})

    await tick()
    expect(app.calls[0].request.signal.aborted).toBe(false)

    // The client hangs up: the runtime destroys the response stream.
    sink.stream.destroy()
    await done

    expect(app.calls[0].request.signal.aborted).toBe(true)
    expect(cancelled).toBeDefined()
  })

  it('leaves the request unaborted when the response completes normally', async () => {
    const sink = freeStream()
    const app = fakeApp(() => new Response('done'))
    await respondWithStream(app)(restEvent(), sink.stream, {})
    // 'close' also fires on a clean end; that must not read as a disconnect.
    await tick()
    expect(app.calls[0].request.signal.aborted).toBe(false)
  })

  it('stops pumping once the client is gone', async () => {
    const sink = blockingStream()
    let enqueued = 0
    const body = new ReadableStream({
      pull(controller) {
        enqueued += 1
        controller.enqueue(new TextEncoder().encode('x'.repeat(64)))
      },
    })
    const done = respondWithStream(fakeApp(() => new Response(body)))(
      restEvent(),
      sink.stream,
      {},
    )
    await tick()
    sink.stream.destroy()
    await done

    const settled = enqueued
    await tick()
    // An unbounded body: if the pump kept reading, this would keep growing.
    expect(enqueued).toBe(settled)
  })
})

describe('streamHandler', () => {
  afterEach(() => {
    delete globalThis.awslambda
  })

  it('registers the responder with the runtime streaming wrapper', () => {
    installAwsLambdaGlobal()
    expect(streamHandler(fakeApp(() => new Response('x'))).__streamified).toBe(
      true,
    )
  })

  it('names the streaming runtime when awslambda is absent', () => {
    delete globalThis.awslambda
    expect(() => streamHandler(fakeApp(() => new Response('x')))).toThrow(
      /awslambda/,
    )
  })
})
