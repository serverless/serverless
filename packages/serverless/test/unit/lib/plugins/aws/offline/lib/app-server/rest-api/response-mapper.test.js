import { formatRestApiResponse } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/response-mapper.js'

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

describe('formatRestApiResponse — AWS_PROXY', () => {
  it('null Lambda result → 200 with empty body', () => {
    const h = makeH()
    formatRestApiResponse(null, h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('')
  })

  it('undefined Lambda result → 200 with empty body', () => {
    const h = makeH()
    formatRestApiResponse(undefined, h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('')
  })

  it('plain string result → 200 text/plain', () => {
    const h = makeH()
    formatRestApiResponse('hello', h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('hello')
    expect(h.calls.contentType).toBe('text/plain')
  })

  it('plain object without statusCode → 200 JSON', () => {
    const h = makeH()
    formatRestApiResponse({ ok: true }, h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.contentType).toBe('application/json')
    expect(JSON.parse(h.calls.payload)).toEqual({ ok: true })
  })

  it('shaped {statusCode, body} → those values, defaulting content-type to application/json', () => {
    const h = makeH()
    formatRestApiResponse({ statusCode: 201, body: 'created' }, h)
    expect(h.calls.statusCode).toBe(201)
    expect(h.calls.payload).toBe('created')
    expect(h.calls.contentType).toBe('application/json')
  })

  it('headers from shaped response are applied', () => {
    const h = makeH()
    formatRestApiResponse(
      { statusCode: 200, body: 'ok', headers: { 'x-custom': 'yes' } },
      h,
    )
    expect(h.calls.headers).toContainEqual({
      name: 'x-custom',
      value: 'yes',
      opts: undefined,
    })
  })

  it('multiValueHeaders emits one header line per value with append:true', () => {
    const h = makeH()
    formatRestApiResponse(
      {
        statusCode: 200,
        body: 'ok',
        multiValueHeaders: { 'x-tag': ['a', 'b'] },
      },
      h,
    )
    const xTag = h.calls.headers.filter((c) => c.name === 'x-tag')
    expect(xTag).toHaveLength(2)
    expect(xTag[0]).toMatchObject({ value: 'a' })
    expect(xTag[1]).toMatchObject({ value: 'b' })
    expect(xTag.every((c) => c.opts?.append === true)).toBe(true)
  })

  it('headers + multiValueHeaders combine — single value first, multi appended', () => {
    const h = makeH()
    formatRestApiResponse(
      {
        statusCode: 200,
        body: 'ok',
        headers: { 'x-trace': 'primary' },
        multiValueHeaders: { 'x-trace': ['secondary'] },
      },
      h,
    )
    const xTrace = h.calls.headers.filter((c) => c.name === 'x-trace')
    expect(xTrace).toHaveLength(2)
    expect(xTrace[0].value).toBe('primary')
    expect(xTrace[1].value).toBe('secondary')
  })

  it('multiValueHeaders with non-array values are silently skipped', () => {
    const h = makeH()
    formatRestApiResponse(
      {
        statusCode: 200,
        body: 'ok',
        multiValueHeaders: { 'x-bad': 'not-an-array' },
      },
      h,
    )
    expect(h.calls.headers.find((c) => c.name === 'x-bad')).toBeUndefined()
  })

  it('isBase64Encoded:true decodes body before sending', () => {
    const h = makeH()
    const original = Buffer.from([1, 2, 3, 4])
    formatRestApiResponse(
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

  it('isBase64Encoded:false passes body through unchanged', () => {
    const h = makeH()
    formatRestApiResponse(
      { statusCode: 200, body: 'plain', isBase64Encoded: false },
      h,
    )
    expect(h.calls.payload).toBe('plain')
  })

  it('non-string body without isBase64Encoded → 502 with AWS-spec error envelope', () => {
    const h = makeH()
    formatRestApiResponse({ statusCode: 200, body: { wrong: 'shape' } }, h)
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('null body in shaped response is treated as empty string', () => {
    const h = makeH()
    formatRestApiResponse({ statusCode: 204, body: null }, h)
    expect(h.calls.statusCode).toBe(204)
    expect(h.calls.payload).toBe('')
  })

  it('undefined body in shaped response is treated as empty string', () => {
    const h = makeH()
    formatRestApiResponse({ statusCode: 204 }, h)
    expect(h.calls.statusCode).toBe(204)
    expect(h.calls.payload).toBe('')
  })

  it('Set-Cookie travels via headers (no v1 cookies field)', () => {
    // REST v1 has no `cookies` field on the response — Set-Cookie is just
    // another header. Verify multi-value Set-Cookie works through
    // multiValueHeaders.
    const h = makeH()
    formatRestApiResponse(
      {
        statusCode: 200,
        body: 'ok',
        multiValueHeaders: {
          'set-cookie': ['session=abc; HttpOnly', 'csrf=xyz'],
        },
      },
      h,
    )
    const setCookies = h.calls.headers.filter((c) => c.name === 'set-cookie')
    expect(setCookies).toHaveLength(2)
    expect(setCookies.map((c) => c.value)).toEqual([
      'session=abc; HttpOnly',
      'csrf=xyz',
    ])
  })
})
