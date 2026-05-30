import { formatLambdaProxyResponse } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/lambda-proxy-response.js'

/** Minimal Hapi h-toolkit stub the formatter can drive. */
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

describe('formatLambdaProxyResponse', () => {
  it('null/undefined result → 200 with empty body', () => {
    const h1 = makeH()
    formatLambdaProxyResponse(null, h1)
    expect(h1.calls.statusCode).toBe(200)
    expect(h1.calls.payload).toBe('')

    const h2 = makeH()
    formatLambdaProxyResponse(undefined, h2)
    expect(h2.calls.statusCode).toBe(200)
    expect(h2.calls.payload).toBe('')
  })

  it('plain string result → 200 text/plain', () => {
    const h = makeH()
    formatLambdaProxyResponse('hello', h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('hello')
    expect(h.calls.contentType).toBe('text/plain')
  })

  it('plain object without statusCode → 200 JSON', () => {
    const h = makeH()
    formatLambdaProxyResponse({ ok: true }, h)
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.contentType).toBe('application/json')
    expect(JSON.parse(h.calls.payload)).toEqual({ ok: true })
  })

  it('shaped {statusCode, body} → those values, no content-type set', () => {
    const h = makeH()
    formatLambdaProxyResponse({ statusCode: 201, body: 'created' }, h)
    expect(h.calls.statusCode).toBe(201)
    expect(h.calls.payload).toBe('created')
    expect(h.calls.contentType).toBeUndefined()
  })

  it('non-string body without isBase64Encoded → 502 AWS-spec envelope', () => {
    const h = makeH()
    formatLambdaProxyResponse({ statusCode: 200, body: { wrong: 'shape' } }, h)
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('non-string body WITH isBase64Encoded:true still → 502 (no escape)', () => {
    const h = makeH()
    formatLambdaProxyResponse(
      { statusCode: 200, body: { wrong: 'shape' }, isBase64Encoded: true },
      h,
    )
    expect(h.calls.statusCode).toBe(502)
    expect(JSON.parse(h.calls.payload)).toEqual({
      message: 'Internal server error',
    })
  })

  it('isBase64Encoded:true decodes body before sending', () => {
    const h = makeH()
    const original = Buffer.from([1, 2, 3, 4])
    formatLambdaProxyResponse(
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

  it('headers from shaped response are applied', () => {
    const h = makeH()
    formatLambdaProxyResponse(
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
    formatLambdaProxyResponse(
      {
        statusCode: 200,
        body: 'ok',
        multiValueHeaders: { 'x-tag': ['a', 'b'] },
      },
      h,
    )
    const xTag = h.calls.headers.filter((c) => c.name === 'x-tag')
    expect(xTag).toHaveLength(2)
    expect(xTag.map((c) => c.value)).toEqual(['a', 'b'])
    expect(xTag.every((c) => c.opts?.append === true)).toBe(true)
  })

  it('cookies WITH option:true appends each as set-cookie (HTTP API v2)', () => {
    const h = makeH()
    formatLambdaProxyResponse(
      {
        statusCode: 200,
        body: 'ok',
        cookies: ['session=abc; HttpOnly', 'csrf=xyz'],
      },
      h,
      { cookies: true },
    )
    const setCookies = h.calls.headers.filter((c) => c.name === 'set-cookie')
    expect(setCookies).toHaveLength(2)
    expect(setCookies.map((c) => c.value)).toEqual([
      'session=abc; HttpOnly',
      'csrf=xyz',
    ])
    expect(setCookies.every((c) => c.opts?.append === true)).toBe(true)
  })

  it('cookies WITHOUT option (default) does NOT touch the cookies field (REST v1)', () => {
    const h = makeH()
    formatLambdaProxyResponse(
      {
        statusCode: 200,
        body: 'ok',
        cookies: ['session=abc; HttpOnly', 'csrf=xyz'],
      },
      h,
    )
    expect(h.calls.headers.find((c) => c.name === 'set-cookie')).toBeUndefined()
  })
})

describe('formatLambdaProxyResponse — content-type defaults', () => {
  it('v2 bare-string → application/json', () => {
    const h = makeH()
    formatLambdaProxyResponse('hello', h, { payloadV2: true })
    expect(h.calls.statusCode).toBe(200)
    expect(h.calls.payload).toBe('hello')
    expect(h.calls.contentType).toBe('application/json')
  })

  it('bare-string without payloadV2 stays text/plain', () => {
    const h = makeH()
    formatLambdaProxyResponse('hello', h)
    expect(h.calls.contentType).toBe('text/plain')
  })

  it('shaped response with no content-type defaults to defaultContentType', () => {
    const h = makeH()
    formatLambdaProxyResponse({ statusCode: 200, body: 'x' }, h, {
      defaultContentType: 'application/json',
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('does not override a handler-set content-type (case-insensitive)', () => {
    const h = makeH()
    formatLambdaProxyResponse(
      { statusCode: 200, body: 'x', headers: { 'Content-Type': 'text/csv' } },
      h,
      { defaultContentType: 'application/json' },
    )
    expect(h.calls.contentType).toBeUndefined()
    expect(
      h.calls.headers.some(
        (entry) => entry.name === 'Content-Type' && entry.value === 'text/csv',
      ),
    ).toBe(true)
  })

  it('does not default content-type when defaultContentType is absent (ALB)', () => {
    const h = makeH()
    formatLambdaProxyResponse({ statusCode: 200, body: 'x' }, h)
    expect(h.calls.contentType).toBeUndefined()
  })

  it('does not default content-type for an empty shaped body', () => {
    const h = makeH()
    formatLambdaProxyResponse({ statusCode: 204 }, h, {
      defaultContentType: 'application/json',
    })
    expect(h.calls.contentType).toBeUndefined()
  })
})
