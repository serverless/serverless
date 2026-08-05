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

// `awslambda` is the Lambda runtime's own global, which the entry's streaming
// bridge (`entry/lib/pump.mjs`) calls through. A real Writable stands in for
// the response stream, so the bridge's backpressure and disconnect handling
// meet the same interface here as in the runtime.
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

// `from()` writes nothing itself: it installs the hook that emits the prelude
// from inside the first `write()`, so the metadata only reaches the wire if
// something is written. Modelled that way here, `stream.metadata` is present
// exactly when a real client would have seen a status line.
globalThis.awslambda = {
  streamifyResponse: (fn) => fn,
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
    method === 'POST'
      ? JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 })
      : null,
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

  it('challenges an unauthenticated request when auth is configured', async () => {
    process.env.SERVERLESS_MCP_AUTH_ISSUER = 'https://issuer.example.com'
    process.env.SERVERLESS_MCP_AUTH_AUDIENCES = '["aud-one"]'

    const { handler } = await import(entryPath)
    const response = await invoke(handler, restEvent())

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toContain(
      'resource_metadata="https://abc123.execute-api.us-east-1.amazonaws.com/dev/.well-known/oauth-protected-resource/crm/mcp"',
    )
  })

  it('serves the metadata document over the same bridge', async () => {
    process.env.SERVERLESS_MCP_AUTH_ISSUER = 'https://issuer.example.com'
    process.env.SERVERLESS_MCP_AUTH_AUDIENCES = '["aud-one"]'

    const { handler } = await import(entryPath)
    const response = await invoke(
      handler,
      restEvent({
        path: '/.well-known/oauth-protected-resource/crm/mcp',
        method: 'GET',
      }),
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      resource:
        'https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp',
      authorization_servers: ['https://issuer.example.com'],
      bearer_methods_supported: ['header'],
    })
  })

  // Behind a REST custom domain the base-path mapping never reaches the
  // function, so the deployment states the public URL instead.
  it('advertises the public base URL when one is configured', async () => {
    process.env.SERVERLESS_MCP_AUTH_ISSUER = 'https://issuer.example.com'
    process.env.SERVERLESS_MCP_AUTH_AUDIENCES = '["aud-one"]'
    process.env.SERVERLESS_MCP_PUBLIC_BASE_URL =
      'https://api.acme.com/assistant'

    const { handler } = await import(entryPath)
    const challenge = await invoke(handler, restEvent())
    expect(challenge.headers['www-authenticate']).toContain(
      'resource_metadata="https://api.acme.com/assistant/.well-known/oauth-protected-resource/crm/mcp"',
    )

    const document = await invoke(
      handler,
      restEvent({
        path: '/.well-known/oauth-protected-resource/crm/mcp',
        method: 'GET',
      }),
    )
    expect(JSON.parse(document.body).resource).toBe(
      'https://api.acme.com/assistant/crm/mcp',
    )
  })
})
