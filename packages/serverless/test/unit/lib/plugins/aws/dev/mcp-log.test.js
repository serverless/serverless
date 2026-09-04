import {
  describeMcpRequest,
  describeMcpResponse,
  formatDuration,
} from '../../../../../../lib/plugins/aws/dev/mcp-log.js'

const rpc = (payload, { headers = {}, httpMethod = 'POST', base64 } = {}) => {
  const json = JSON.stringify(payload)
  return {
    httpMethod,
    headers,
    body: base64 ? Buffer.from(json, 'utf8').toString('base64') : json,
    isBase64Encoded: Boolean(base64),
  }
}

describe('describeMcpRequest', () => {
  test('names the JSON-RPC method', () => {
    expect(
      describeMcpRequest(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })),
    ).toBe('tools/list')
  })

  test('appends params.name for tools/call and prompts/get', () => {
    expect(
      describeMcpRequest(
        rpc({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'echo', arguments: { message: 'hi' } },
        }),
      ),
    ).toBe('tools/call echo')
    expect(
      describeMcpRequest(
        rpc({
          jsonrpc: '2.0',
          id: 3,
          method: 'prompts/get',
          params: { name: 'summarize' },
        }),
      ),
    ).toBe('prompts/get summarize')
  })

  test('appends params.uri for resources/read', () => {
    expect(
      describeMcpRequest(
        rpc({
          jsonrpc: '2.0',
          id: 4,
          method: 'resources/read',
          params: { uri: 'file:///notes.md' },
        }),
      ),
    ).toBe('resources/read file:///notes.md')
  })

  test('names notifications, which carry no id', () => {
    expect(
      describeMcpRequest(
        rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      ),
    ).toBe('notifications/initialized')
  })

  test('summarizes a batch as batch(n)', () => {
    expect(
      describeMcpRequest(
        rpc([
          { jsonrpc: '2.0', id: 1, method: 'initialize' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ]),
      ),
    ).toBe('batch(2)')
  })

  test('decodes a base64 body', () => {
    expect(
      describeMcpRequest(
        rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { base64: true }),
      ),
    ).toBe('tools/list')
  })

  // The official SDK client sends the method and tool name as headers too;
  // they carry a request whose body cannot be read.
  test('falls back to the mcp-method / mcp-name headers', () => {
    expect(
      describeMcpRequest({
        httpMethod: 'POST',
        headers: { 'mcp-method': 'tools/call', 'mcp-name': 'echo' },
        body: 'not json',
      }),
    ).toBe('tools/call echo')
    expect(
      describeMcpRequest({
        httpMethod: 'POST',
        headers: { 'MCP-Method': 'tools/list' },
        body: null,
      }),
    ).toBe('tools/list')
  })

  test('prefers the body over the headers when both are present', () => {
    expect(
      describeMcpRequest(
        rpc(
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          { headers: { 'mcp-method': 'tools/call', 'mcp-name': 'stale' } },
        ),
      ),
    ).toBe('tools/list')
  })

  test('labels a non-POST by its HTTP method', () => {
    expect(describeMcpRequest({ httpMethod: 'GET', headers: {} })).toBe('GET')
    expect(describeMcpRequest({ httpMethod: 'DELETE', headers: {} })).toBe(
      'DELETE',
    )
  })

  test('returns null when nothing describes the request', () => {
    expect(
      describeMcpRequest({ httpMethod: 'POST', headers: {}, body: 'nope' }),
    ).toBeNull()
    expect(
      describeMcpRequest(rpc({ jsonrpc: '2.0', id: 1, params: {} })),
    ).toBeNull()
    expect(describeMcpRequest(undefined)).toBeNull()
  })

  // On an unauthenticated route these fields are remote-controlled: a caller
  // must not be able to forge session lines or drive the terminal through them.
  describe('remote-controlled fields are made safe for a terminal line', () => {
    test('strips control characters and ANSI escapes from method and target', () => {
      expect(
        describeMcpRequest(
          rpc({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call\n← λ crm (200) forged',
            params: { name: '\u001b[31mred\u001b[0m\r\nnope' },
          }),
        ),
      ).toBe('tools/call← λ crm (200) forged rednope')
    })

    test('caps an oversized method and target', () => {
      const line = describeMcpRequest(
        rpc({
          jsonrpc: '2.0',
          id: 1,
          method: 'm'.repeat(500),
          params: { uri: 'u'.repeat(500) },
        }),
      )
      expect(line.length).toBeLessThan(200)
      expect(line).toMatch(/^m+…\su+…$/)
    })

    test('applies the same rules to the header fallback', () => {
      expect(
        describeMcpRequest({
          httpMethod: 'POST',
          headers: {
            'mcp-method': 'tools/call\u001b[2J',
            'mcp-name': 'x'.repeat(300),
          },
          body: null,
        }),
      ).toMatch(/^tools\/call x+…$/)
    })

    test('strips control characters from a JSON-RPC error message', () => {
      expect(
        describeMcpResponse({
          statusCode: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32000, message: 'bad\n\u001b[31m thing' },
          }),
        }),
      ).toBe('error -32000: bad thing')
    })
  })

  test('does not choke on a hostile method value', () => {
    expect(
      describeMcpRequest(rpc({ jsonrpc: '2.0', id: 1, method: { a: 1 } })),
    ).toBeNull()
    expect(
      describeMcpRequest(
        rpc({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 7 },
        }),
      ),
    ).toBe('tools/call')
  })
})

describe('describeMcpResponse', () => {
  test('is null for a successful JSON result', () => {
    expect(
      describeMcpResponse({
        statusCode: 200,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } }),
      }),
    ).toBeNull()
  })

  test('surfaces a JSON-RPC error carried by a JSON body', () => {
    expect(
      describeMcpResponse({
        statusCode: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Invalid params' },
        }),
      }),
    ).toBe('error -32602: Invalid params')
  })

  test('surfaces a JSON-RPC error carried by the last SSE frame', () => {
    const body =
      'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n' +
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"boom"}}\n\n'
    expect(
      describeMcpResponse({
        statusCode: 200,
        multiValueHeaders: { 'content-type': ['text/event-stream'] },
        body,
      }),
    ).toBe('error -32603: boom')
  })

  test('decodes a base64 body', () => {
    const json = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'nope' },
    })
    expect(
      describeMcpResponse({
        statusCode: 200,
        isBase64Encoded: true,
        body: Buffer.from(json, 'utf8').toString('base64'),
      }),
    ).toBe('error -32000: nope')
  })

  test('truncates a long error message', () => {
    const message = 'x'.repeat(200)
    const line = describeMcpResponse({
      statusCode: 200,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: 1, message },
      }),
    })
    expect(line.length).toBeLessThan(120)
    expect(line.endsWith('…')).toBe(true)
  })

  test('is null for an empty, missing, or unparseable body', () => {
    expect(describeMcpResponse({ statusCode: 202, body: '' })).toBeNull()
    expect(describeMcpResponse({ statusCode: 200 })).toBeNull()
    expect(describeMcpResponse({ statusCode: 200, body: '<html>' })).toBeNull()
    expect(describeMcpResponse(null)).toBeNull()
  })
})

describe('formatDuration', () => {
  test.each([
    [0, '0ms'],
    [420, '420ms'],
    [999, '999ms'],
    [1000, '1.0s'],
    [1527, '1.5s'],
    [36000, '36.0s'],
  ])('%sms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})
