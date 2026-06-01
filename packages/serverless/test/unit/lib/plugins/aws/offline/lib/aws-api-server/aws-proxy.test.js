import {
  buildAwsEndpoint,
  createAwsProxy,
} from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/aws-proxy.js'

// Minimal Hapi `h` stub: h.response(body).code(n).type(t).header(k,v)
const makeH = () => {
  const res = { _code: 200, _headers: {} }
  const api = {
    response(body) {
      res.body = body
      return api
    },
    code(c) {
      res._code = c
      return api
    },
    type(t) {
      res._headers['content-type'] = t
      return api
    },
    header(k, v) {
      res._headers[k] = v
      return api
    },
  }
  api._res = res
  return api
}

describe('createAwsProxy', () => {
  it('re-signs with real creds for the right service/region and relays the response', async () => {
    const sent = {}
    const forward = async ({ url, method, headers, body }) => {
      sent.url = url
      sent.method = method
      sent.headers = headers
      sent.body = body
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/x-amz-json-1.0' },
        body: '{"ok":true}',
      }
    }
    const proxy = createAwsProxy({
      credentials: { accessKeyId: 'AKIAREAL', secretAccessKey: 'realsecret' },
      forward,
    })
    const request = {
      method: 'POST',
      path: '/',
      query: {},
      headers: {
        authorization:
          'AWS4-HMAC-SHA256 Credential=test/20260601/us-east-1/dynamodb/aws4_request, SignedHeaders=host, Signature=placeholder',
        'x-amz-target': 'DynamoDB_20120810.PutItem',
        'content-type': 'application/x-amz-json-1.0',
      },
      payload: Buffer.from('{"TableName":"t"}'),
    }
    const h = makeH()
    await proxy(request, { service: 'dynamodb', region: 'us-east-1' }, h)

    expect(sent.url).toBe('https://dynamodb.us-east-1.amazonaws.com/')
    const outAuth = sent.headers.authorization || sent.headers.Authorization
    expect(outAuth).toMatch(
      /Credential=AKIAREAL\/\d{8}\/us-east-1\/dynamodb\/aws4_request/,
    )
    expect(outAuth).not.toContain('Signature=placeholder')
    expect(h._res._code).toBe(200)
    expect(h._res.body).toBe('{"ok":true}')
  })

  it('returns a clear error when credentials are missing', async () => {
    const proxy = createAwsProxy({
      credentials: null,
      forward: async () => {
        throw new Error('should not forward')
      },
    })
    const h = makeH()
    await proxy(
      { method: 'POST', path: '/', headers: {}, payload: Buffer.from('') },
      { service: 'dynamodb', region: 'us-east-1' },
      h,
    )
    expect(h._res._code).toBe(501)
    expect(JSON.stringify(h._res.body)).toContain(
      'OFFLINE_PROXY_NO_CREDENTIALS',
    )
  })

  it('returns a clear error when the endpoint cannot be built', async () => {
    const proxy = createAwsProxy({
      credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
      forward: async () => ({}),
    })
    const h = makeH()
    await proxy(
      { method: 'POST', path: '/', headers: {}, payload: Buffer.from('') },
      { service: 'dynamodb', region: '' },
      h,
    )
    expect(h._res._code).toBe(501)
    expect(JSON.stringify(h._res.body)).toContain(
      'OFFLINE_PROXY_UNSUPPORTED_ENDPOINT',
    )
  })

  it('returns an upstream error when forward throws', async () => {
    const proxy = createAwsProxy({
      credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
      forward: async () => {
        throw new Error('socket hang up')
      },
    })
    const h = makeH()
    await proxy(
      {
        method: 'POST',
        path: '/',
        query: {},
        headers: {},
        payload: Buffer.from('{}'),
      },
      { service: 'dynamodb', region: 'us-east-1' },
      h,
    )
    expect(h._res._code).toBe(502)
    expect(JSON.stringify(h._res.body)).toContain(
      'OFFLINE_PROXY_UPSTREAM_ERROR',
    )
  })

  it('forwards repeated query params individually so the signature matches', async () => {
    const sent = {}
    const forward = async ({ url }) => {
      sent.url = url
      return { statusCode: 200, headers: {}, body: '' }
    }
    const proxy = createAwsProxy({
      credentials: { accessKeyId: 'AKIAREAL', secretAccessKey: 'realsecret' },
      forward,
    })
    await proxy(
      {
        method: 'GET',
        path: '/',
        query: { ids: ['1', '2'], q: 'x' },
        headers: {
          authorization:
            'AWS4-HMAC-SHA256 Credential=test/20260601/us-east-1/dynamodb/aws4_request, SignedHeaders=host, Signature=placeholder',
        },
        payload: Buffer.from(''),
      },
      { service: 'dynamodb', region: 'us-east-1' },
      makeH(),
    )
    expect(sent.url).toContain('ids=1')
    expect(sent.url).toContain('ids=2')
    expect(sent.url).not.toContain('ids=1%2C2')
    expect(sent.url).not.toContain('ids=1,2')
    expect(sent.url).toContain('q=x')
  })

  it('passes temporary-credential session token to the signer', async () => {
    const sent = {}
    const forward = async ({ headers }) => {
      sent.headers = headers
      return { statusCode: 200, headers: {}, body: '' }
    }
    const proxy = createAwsProxy({
      credentials: {
        accessKeyId: 'AKIAREAL',
        secretAccessKey: 's',
        sessionToken: 'TEMPTOKEN',
      },
      forward,
    })
    await proxy(
      {
        method: 'POST',
        path: '/',
        query: {},
        headers: {
          authorization:
            'AWS4-HMAC-SHA256 Credential=test/20260601/us-east-1/dynamodb/aws4_request, SignedHeaders=host, Signature=placeholder',
        },
        payload: Buffer.from('{}'),
      },
      { service: 'dynamodb', region: 'us-east-1' },
      makeH(),
    )
    const tokenHeader =
      sent.headers['x-amz-security-token'] ||
      sent.headers['X-Amz-Security-Token']
    expect(tokenHeader).toBe('TEMPTOKEN')
  })
})

describe('buildAwsEndpoint', () => {
  it('builds the standard regional endpoint', () => {
    expect(buildAwsEndpoint('dynamodb', 'us-east-1')).toBe(
      'https://dynamodb.us-east-1.amazonaws.com',
    )
    expect(buildAwsEndpoint('secretsmanager', 'eu-west-1')).toBe(
      'https://secretsmanager.eu-west-1.amazonaws.com',
    )
  })

  it('returns null when service or region is missing', () => {
    expect(buildAwsEndpoint('', 'us-east-1')).toBeNull()
    expect(buildAwsEndpoint('dynamodb', '')).toBeNull()
  })
})
