import { buildNonProxyEvent } from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/non-proxy/event-factory.js'

function makeRequest(overrides = {}) {
  return {
    method: 'POST',
    params: { id: '42' },
    query: {},
    headers: { 'content-type': 'application/json' },
    info: { remoteAddress: '127.0.0.1' },
    raw: { req: { rawHeaders: ['Content-Type', 'application/json'] } },
    mime: 'application/json',
    payload: { hello: 'world' },
    ...overrides,
  }
}

describe('buildNonProxyEvent', () => {
  it('renders the matching content-type template into the event JSON', () => {
    const event = buildNonProxyEvent({
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/items/{id}',
      requestTemplates: {
        'application/json':
          '{"id": "$input.params(\'id\')", "msg": $input.json(\'$.hello\')}',
      },
    })
    expect(event).toEqual({ id: '42', msg: 'world' })
  })

  it('falls back to the request payload when no template matches the content type', () => {
    const event = buildNonProxyEvent({
      request: makeRequest({
        headers: { 'content-type': 'text/plain' },
        mime: 'text/plain',
        payload: 'just text',
      }),
      stage: 'dev',
      resourcePath: '/x',
      requestTemplates: { 'application/json': '{"x": 1}' },
    })
    expect(event).toBe('just text')
  })

  it('applies the default AWS request template for application/json when none is configured', () => {
    const event = buildNonProxyEvent({
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/items/{id}',
      requestTemplates: undefined,
    })
    expect(Object.keys(event)).toEqual(
      expect.arrayContaining([
        'body',
        'method',
        'headers',
        'query',
        'path',
        'identity',
        'stageVariables',
        'enhancedAuthContext',
        'principalId',
        'requestPath',
      ]),
    )
    expect(event.body).toEqual({ hello: 'world' })
    expect(event.method).toBe('POST')
  })

  it('an explicit application/json template wins over the default', () => {
    const event = buildNonProxyEvent({
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/items/{id}',
      requestTemplates: {
        'application/json': '{"custom":"$context.httpMethod"}',
      },
    })
    expect(event).toEqual({ custom: 'POST' })
  })

  it('forwards the raw payload for a non-JSON content type with no template', () => {
    const event = buildNonProxyEvent({
      request: makeRequest({ mime: 'text/plain', payload: 'just text' }),
      stage: 'dev',
      resourcePath: '/x',
      requestTemplates: undefined,
    })
    expect(event).toBe('just text')
  })

  it('default content-type is application/json when request.mime is absent', () => {
    const event = buildNonProxyEvent({
      request: makeRequest({ mime: undefined }),
      stage: 'dev',
      resourcePath: '/x',
      requestTemplates: {
        'application/json': '{"received": $input.json(\'$\')}',
      },
    })
    expect(event).toEqual({ received: { hello: 'world' } })
  })

  it('throws OFFLINE_REST_TEMPLATE_RENDER_FAILED when the template is invalid', () => {
    expect(() =>
      buildNonProxyEvent({
        request: makeRequest(),
        stage: 'dev',
        resourcePath: '/x',
        requestTemplates: { 'application/json': '$invalid(((((' },
      }),
    ).toThrow(/OFFLINE_REST_TEMPLATE_RENDER_FAILED|template/i)
  })
})
