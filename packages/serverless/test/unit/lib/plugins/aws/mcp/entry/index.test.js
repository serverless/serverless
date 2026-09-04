import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import path from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
)

const entryPath = '../../../../../../../lib/plugins/aws/mcp/entry/index.mjs'

// The state resolver is the one cold-start step that talks to AWS; everything
// else in the entry is real here, including the user-module import.
const resolveStateKey = jest.fn()
jest.unstable_mockModule(
  '../../../../../../../lib/plugins/aws/mcp/entry/lib/state.mjs',
  () => ({ resolveStateKey }),
)

// `awslambda` is the Lambda runtime's own global, which Hono's streaming bridge
// calls through. A real Writable stands in for the response stream, so the
// bridge meets the same interface here as in the runtime.
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

// The runtime reads this mark off the function `streamifyResponse` is handed to
// select streaming mode, so the double sets it the way the runtime does.
const STREAMING = Symbol.for('aws.lambda.runtime.handler.streaming')

globalThis.awslambda = {
  streamifyResponse: (fn) => {
    fn[STREAMING] = 'response'
    return fn
  },
  // `from()` writes nothing itself: it installs the hook that emits the prelude
  // from inside the first `write()`, so the metadata only reaches the wire if
  // something is written. Modelled that way here, `stream.metadata` is present
  // exactly when a real client would have seen a status line.
  HttpResponseStream: {
    from: (stream, metadata) => {
      const write = stream.write.bind(stream)
      stream.write = (...args) => {
        if (stream.metadata === undefined) stream.metadata = metadata
        return write(...args)
      }
      return stream
    },
  },
}

const invoke = async (handler, event) => {
  const stream = fakeStream()
  await handler(event, stream, {})
  return {
    statusCode: stream.metadata.statusCode,
    headers: stream.metadata.headers,
    body: Buffer.concat(stream.chunks).toString(),
  }
}

const restEvent = ({
  path: requestPath = '/crm/mcp',
  method = 'POST',
  headers = {},
  body,
} = {}) => ({
  version: '1.0',
  httpMethod: method,
  path: requestPath,
  headers: {
    Host: 'abc123.execute-api.us-east-1.amazonaws.com',
    'X-Forwarded-Proto': 'https',
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    ...headers,
  },
  body:
    body ??
    (method === 'POST'
      ? JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 })
      : null),
  isBase64Encoded: false,
  requestContext: {
    domainName: 'abc123.execute-api.us-east-1.amazonaws.com',
    stage: 'dev',
    path: `/dev${requestPath}`,
  },
})

const ENTRY_VARIABLES = [
  'SERVERLESS_MCP_SERVER_MODULE',
  'SERVERLESS_MCP_AUTH_ISSUER',
  'SERVERLESS_MCP_AUTH_AUDIENCES',
  'SERVERLESS_MCP_STATE_KEY_REF',
  'SERVERLESS_MCP_STATE_KEY',
  'SERVERLESS_MCP_PUBLIC_BASE_URL',
  'LAMBDA_TASK_ROOT',
  'AWS_REGION',
]

describe('mcp entry', () => {
  beforeEach(() => {
    jest.resetModules()
    resolveStateKey.mockReset()
    globalThis.__mcpEntryImports = []
    for (const name of ENTRY_VARIABLES) delete process.env[name]
    process.env.SERVERLESS_MCP_SERVER_MODULE = 'server.mjs'
    process.env.LAMBDA_TASK_ROOT = fixturesDir
  })

  it('places the state key in the environment before importing the server', async () => {
    process.env.SERVERLESS_MCP_STATE_KEY_REF =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:crm-AbCdEf'
    process.env.AWS_REGION = 'us-east-1'
    resolveStateKey.mockResolvedValue('the-key')

    await import(entryPath)

    expect(resolveStateKey).toHaveBeenCalledWith({
      keyRef: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:crm-AbCdEf',
      region: 'us-east-1',
    })
    // The fixture read the variable as its module body ran: seeing the key
    // there is what proves the resolution happened first.
    expect(globalThis.__mcpEntryImports).toEqual(['the-key'])
    expect(process.env.SERVERLESS_MCP_STATE_KEY).toBe('the-key')
  })

  it('never reaches the server module when the state key cannot be read', async () => {
    process.env.SERVERLESS_MCP_STATE_KEY_REF = 'arn:aws:ssm:::parameter/nope'
    resolveStateKey.mockRejectedValue(new Error('AccessDenied'))

    await expect(import(entryPath)).rejects.toThrow('AccessDenied')
    expect(globalThis.__mcpEntryImports).toEqual([])
  })

  it('does not touch the state resolver when no key is referenced', async () => {
    await import(entryPath)

    expect(resolveStateKey).not.toHaveBeenCalled()
    expect(globalThis.__mcpEntryImports).toEqual([null])
  })

  it('names SERVERLESS_MCP_SERVER_MODULE when it is not set', async () => {
    delete process.env.SERVERLESS_MCP_SERVER_MODULE

    await expect(import(entryPath)).rejects.toThrow(
      /SERVERLESS_MCP_SERVER_MODULE/,
    )
    expect(globalThis.__mcpEntryImports).toEqual([])
  })

  it('serves the user handler through the streaming Lambda bridge', async () => {
    const { handler } = await import(entryPath)

    const response = await invoke(handler, restEvent())

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('handled')
  })

  // Dev mode imports this same prebuilt file on the user's machine and calls
  // the buffered door, so the export has to be there and has to serve the same
  // app the streaming one does.
  it('serves the user handler through the buffered Lambda bridge too', async () => {
    const { bufferedHandler } = await import(entryPath)

    const result = await bufferedHandler(restEvent(), {})

    expect(result.statusCode).toBe(202)
    expect(result.body).toBe('handled')
    expect(result.isBase64Encoded).toBe(false)
  })

  // `awslambda` is injected by the Lambda runtime, and `streamHandle` reads it
  // as it is called — at module scope. Unguarded, importing this file anywhere
  // else (dev mode, on the user's machine) throws a ReferenceError before any
  // export is reachable, which would put the buffered door out of reach of the
  // only caller that needs it.
  it('imports with no Lambda runtime global, leaving only the buffered door', async () => {
    const { awslambda } = globalThis
    delete globalThis.awslambda
    try {
      const entry = await import(entryPath)

      expect(typeof entry.bufferedHandler).toBe('function')
      expect(entry.handler).toBeUndefined()
      // And the door that remains is a working one, not just a present name.
      const result = await entry.bufferedHandler(restEvent(), {})
      expect(result.statusCode).toBe(202)
      expect(result.body).toBe('handled')
    } finally {
      globalThis.awslambda = awslambda
    }
  })

  // The global's mere presence does not mean a Lambda runtime put it there:
  // `@aws/lambda-invoke-store`, which every AWS SDK v3 client pulls in - and a
  // `state:` server loads one to read its key - assigns
  // `globalThis.awslambda ||= {}` on import. Off Lambda that leaves exactly this
  // shape, and a presence-only guard hands it to Hono's bridge, which calls
  // `streamifyResponse` on it and throws at module scope. Live-observed as a
  // 502 through a dev session, with the local child never getting past import.
  it('leaves only the buffered door when the SDK stubbed the global', async () => {
    const { awslambda } = globalThis
    globalThis.awslambda = {}
    try {
      const entry = await import(entryPath)

      expect(typeof entry.bufferedHandler).toBe('function')
      expect(entry.handler).toBeUndefined()
      const result = await entry.bufferedHandler(restEvent(), {})
      expect(result.statusCode).toBe(202)
      expect(result.body).toBe('handled')
    } finally {
      globalThis.awslambda = awslambda
    }
  })

  // The exported handler wraps the bridge to correct the event first, and the
  // runtime selects streaming mode from a mark on the function it is given —
  // so the wrapper has to still carry it.
  it('is registered with the runtime as a streaming handler', async () => {
    const { handler } = await import(entryPath)

    expect(handler[STREAMING]).toBe('response')
  })

  // Today's runtime sets that mark by plain assignment, which makes it
  // enumerable; the wrapper copies property *descriptors* so it would survive a
  // runtime that defined it any other way.
  it('carries the mark over even when the runtime defines it non-enumerably', async () => {
    const { streamifyResponse } = globalThis.awslambda
    globalThis.awslambda.streamifyResponse = (fn) =>
      Object.defineProperty(fn, STREAMING, {
        value: 'response',
        enumerable: false,
      })
    try {
      const { handler } = await import(entryPath)

      expect(handler[STREAMING]).toBe('response')
    } finally {
      globalThis.awslambda.streamifyResponse = streamifyResponse
    }
  })

  // API Gateway will deliver a GET or HEAD carrying a body, and a `Request`
  // cannot represent one: unless the event is corrected first, building it
  // throws and the request fails before the user's server is reached.
  // The response body is asserted only for GET: Hono answers a HEAD with the
  // status and headers alone, as HTTP requires.
  it.each([
    ['GET', 'handled'],
    ['HEAD', ''],
  ])('serves a %s that carries a body', async (method, expectedBody) => {
    const { handler } = await import(entryPath)

    const response = await invoke(
      handler,
      restEvent({
        method,
        body: 'ignored',
        headers: { 'Content-Length': '7' },
      }),
    )

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe(expectedBody)
  })

  // A function deployed by an earlier release still carries these variables.
  // Verifying tokens and serving discovery documents is the API's job now, so
  // the entry passes every request straight to the user's server regardless.
  it('serves the handler with the auth variables of an earlier release set', async () => {
    process.env.SERVERLESS_MCP_AUTH_ISSUER = 'https://issuer.example.com'
    process.env.SERVERLESS_MCP_AUTH_AUDIENCES = '["aud-one"]'
    process.env.SERVERLESS_MCP_PUBLIC_BASE_URL =
      'https://api.acme.com/assistant'

    const { handler } = await import(entryPath)
    const response = await invoke(handler, restEvent())

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('handled')
    expect(response.headers['www-authenticate']).toBeUndefined()
  })

  // There is no metadata document to serve and no route reserved for one: the
  // well-known path is the user's server's like any other.
  it('routes a well-known discovery path to the user handler', async () => {
    process.env.SERVERLESS_MCP_AUTH_ISSUER = 'https://issuer.example.com'

    const { handler } = await import(entryPath)
    const response = await invoke(
      handler,
      restEvent({
        path: '/.well-known/oauth-protected-resource/crm/mcp',
        method: 'GET',
      }),
    )

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('handled')
  })
})
