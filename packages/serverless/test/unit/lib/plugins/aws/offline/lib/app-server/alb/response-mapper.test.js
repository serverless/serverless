import { formatAlbResponse } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/alb/response-mapper.js'

/** Minimal Hapi h-toolkit stub the mapper can drive. */
function makeH() {
  const calls = { headers: [] }
  const builder = {
    code(c) {
      calls.statusCode = c
      return builder
    },
    type(t) {
      calls.contentType = t
      return builder
    },
    header(name, value, opts) {
      calls.headers.push({ name, value, opts })
      return builder
    },
  }
  return {
    calls,
    response(payload) {
      calls.payload = payload
      return builder
    },
  }
}

describe('formatAlbResponse — ALB Lambda response', () => {
  it('null Lambda result → 200 with empty body', () => {
    const h = makeH()
    formatAlbResponse(null, h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('')
  })

  it('plain string result → 200 text/plain', () => {
    const h = makeH()
    formatAlbResponse('hello', h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('hello')
    expect(h.calls.contentType).toBe('text/plain')
  })

  it('plain object without statusCode → 502 envelope', () => {
    const h = makeH()
    formatAlbResponse({ ok: true }, h)
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('shaped response: statusCode + body + headers honored', () => {
    const h = makeH()
    formatAlbResponse(
      {
        statusCode: 201,
        body: 'created',
        headers: { 'x-custom': 'yes' },
      },
      h,
    )
    expect(h.calls.statusCode).toBe(201)
    expect(h.calls.payload).toBe('created')
    expect(h.calls.headers).toContainEqual({
      name: 'x-custom',
      value: 'yes',
      opts: undefined,
    })
  })

  it('shaped + isBase64Encoded → body decoded to Buffer', () => {
    const h = makeH()
    const original = Buffer.from([1, 2, 3, 4])
    formatAlbResponse(
      {
        statusCode: 200,
        body: original.toString('base64'),
        isBase64Encoded: true,
      },
      h,
    )
    expect(h.calls.payload).toBeInstanceOf(Buffer)
    expect(h.calls.payload.equals(original)).toBe(true)
  })

  it('non-string body without isBase64Encoded → 502 envelope (inherited from shared core)', () => {
    const h = makeH()
    formatAlbResponse({ statusCode: 200, body: { wrong: 'shape' } }, h)
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('shaped response omitting statusCode → 502 envelope', () => {
    const h = makeH()
    formatAlbResponse({ body: 'x' }, h)
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
    expect(h.calls.contentType).toBe('application/json')
  })
})
