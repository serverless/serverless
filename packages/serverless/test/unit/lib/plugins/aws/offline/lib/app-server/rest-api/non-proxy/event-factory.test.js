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

  it('falls back to the request payload when requestTemplates is undefined', () => {
    const event = buildNonProxyEvent({
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/x',
      requestTemplates: undefined,
    })
    expect(event).toEqual({ hello: 'world' })
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
