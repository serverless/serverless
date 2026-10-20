import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'
import { createHash, createHmac } from 'node:crypto'
import AwsInvokeWebApp from '../../../../../lib/plugins/aws/invoke-web-app.js'

const API_URL = 'https://abc123.lambda-web.us-east-1.on.aws'
const LOG_STREAM = '2026/10/15/lambda-web-logstream-abc'
const REQUEST_ID = 'req-1'
const NOW = Date.parse('2026-10-15T10:00:00.000Z')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const makePlugin = ({
  options,
  webApps = { api: { entry: 'src/server.ts' } },
  providerConfig = {},
  outputs = [{ OutputKey: 'ApiWebFunctionUrl', OutputValue: API_URL }],
  filterLogEvents = async () => ({ events: [] }),
  describeStacks = async () => ({ Stacks: [{ Outputs: outputs }] }),
} = {}) => {
  const logger = {
    notice: jest.fn(),
    aside: jest.fn(),
    blankLine: jest.fn(),
    warning: jest.fn(),
    debug: jest.fn(),
  }
  const progress = { notice: jest.fn(), remove: jest.fn() }
  const request = jest.fn(async (service, method, params) => {
    if (method === 'describeStacks') return describeStacks(params)
    if (method === 'filterLogEvents') return filterLogEvents(params)
    throw new Error(`unexpected ${service}.${method}`)
  })
  const serverless = {
    service: { service: 'shop', webApps, provider: providerConfig },
    configurationInput: { webApps },
    getProvider: () => ({
      request,
      getRegion: () => 'us-east-1',
      getStage: () => 'dev',
      getCredentials: async () => ({
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'secret',
        sessionToken: 'session-token',
      }),
      naming: { getStackName: () => 'shop-dev' },
    }),
  }
  const plugin = new AwsInvokeWebApp(serverless, options, {
    log: logger,
    progress,
  })
  return { plugin, logger, progress, request }
}

const respond = (body, { status = 200, headers = {} } = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain',
      'lambda-web-request-id': REQUEST_ID,
      'lambda-web-logstream': LOG_STREAM,
      ...headers,
    },
  })

let stdout
beforeEach(() => {
  stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete global.fetch
})

const written = () =>
  stdout.mock.calls
    .map(([chunk]) => Buffer.from(chunk).toString('utf8'))
    .join('')

describe('invoke --web-app', () => {
  it('does nothing without --web-app', async () => {
    global.fetch = jest.fn()
    const { plugin, request } = makePlugin({ options: { function: 'hello' } })
    await plugin.hooks['invoke:invoke']()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('names the web apps when the name is unknown', async () => {
    const { plugin } = makePlugin({
      options: { 'web-app': 'nope' },
      webApps: { api: {}, web: {} },
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'WEB_APPS_NOT_FOUND',
      stack: undefined,
      message: 'No web app named "nope" in this service. Web apps: api, web.',
    })
  })

  it('says when the web app has no endpoint URL in the stack', async () => {
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      outputs: [],
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'WEB_APPS_NOT_DEPLOYED',
      stack: undefined,
    })
  })

  it('sends a plain request to a public endpoint and prints status, headers and body', async () => {
    global.fetch = jest.fn(async () => respond('ok'))
    const { plugin, logger, progress } = makePlugin({
      options: { 'web-app': 'api', path: '/health' },
    })
    await plugin.hooks['invoke:invoke']()

    const [url, init] = global.fetch.mock.calls[0]
    expect(String(url)).toBe(`${API_URL}/health`)
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).not.toHaveProperty('authorization')
    expect(progress.remove).toHaveBeenCalled()
    expect(logger.notice).toHaveBeenCalledWith('HTTP 200 OK')
    expect(logger.aside).toHaveBeenCalledWith('content-type: text/plain')
    expect(logger.aside).toHaveBeenCalledWith(
      `lambda-web-request-id: ${REQUEST_ID}`,
    )
    expect(written()).toBe('ok\n')
  })

  it('defaults to GET / and adds a leading slash to the path', async () => {
    global.fetch = jest.fn(async () => respond(''))
    const { plugin } = makePlugin({ options: { 'web-app': 'api' } })
    await plugin.hooks['invoke:invoke']()
    expect(String(global.fetch.mock.calls[0][0])).toBe(`${API_URL}/`)

    global.fetch.mockClear()
    const other = makePlugin({
      options: { 'web-app': 'api', path: 'search?q=a', method: 'post' },
    })
    await other.plugin.hooks['invoke:invoke']()
    const [url, init] = global.fetch.mock.calls[0]
    expect(String(url)).toBe(`${API_URL}/search?q=a`)
    expect(init.method).toBe('POST')
  })

  it('streams the body to stdout as it arrives', async () => {
    const encoder = new TextEncoder()
    let pull = 0
    const body = new ReadableStream({
      pull(controller) {
        pull += 1
        if (pull === 1) controller.enqueue(encoder.encode('first '))
        else if (pull === 2) controller.enqueue(encoder.encode('second\n'))
        else controller.close()
      },
    })
    global.fetch = jest.fn(async () => respond(body))
    const { plugin } = makePlugin({ options: { 'web-app': 'api' } })
    await plugin.hooks['invoke:invoke']()
    expect(
      stdout.mock.calls.map(([chunk]) => Buffer.from(chunk).toString()),
    ).toEqual(['first ', 'second\n'])
  })

  it('signs requests to an aws_iam endpoint with SigV4 and the body hash', async () => {
    global.fetch = jest.fn(async () => respond('created', { status: 201 }))
    const { plugin } = makePlugin({
      options: {
        'web-app': 'admin',
        path: '/orders?x=1',
        method: 'POST',
        data: '{"sku":"A-1"}',
      },
      webApps: { admin: { url: { authorizer: 'AWS_IAM' } } },
      outputs: [{ OutputKey: 'AdminWebFunctionUrl', OutputValue: API_URL }],
    })
    await plugin.hooks['invoke:invoke']()
    const [url, init] = global.fetch.mock.calls[0]
    expect(String(url)).toBe(`${API_URL}/orders?x=1`)
    expect(init.body).toBe('{"sku":"A-1"}')
    expect(init.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/lambda\/aws4_request, SignedHeaders=.*x-amz-content-sha256/,
    )
    expect(init.headers['x-amz-content-sha256']).toBe(sha256('{"sku":"A-1"}'))
    expect(init.headers['x-amz-security-token']).toBe('session-token')
    expect(init.headers).not.toHaveProperty('host')
  })

  it('signs requests to a web app behind a custom domain', async () => {
    global.fetch = jest.fn(async () => respond('ok'))
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      providerConfig: {
        domains: [{ name: 'shop.example.com', webApp: 'api' }],
      },
    })
    await plugin.hooks['invoke:invoke']()
    const [, init] = global.fetch.mock.calls[0]
    expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /)
    expect(init.headers['x-amz-content-sha256']).toBe(sha256(''))
  })

  it('prints the body of an error response, then fails with its status', async () => {
    global.fetch = jest.fn(async () =>
      respond('boom', {
        status: 502,
        headers: { 'lambda-web-error-type': 'Application.InitCodeError' },
      }),
    )
    const { plugin, logger } = makePlugin({ options: { 'web-app': 'api' } })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'WEB_APPS_INVOKE_HTTP_ERROR',
      stack: undefined,
      message: 'Web app "api" returned HTTP 502.',
    })
    expect(logger.notice).toHaveBeenCalledWith('HTTP 502 Bad Gateway')
    expect(written()).toBe('boom\n')
  })

  it('prints a redirect without following it', async () => {
    global.fetch = jest.fn(async () =>
      respond('', {
        status: 302,
        headers: { location: 'https://elsewhere.example.com/login' },
      }),
    )
    const { plugin, logger } = makePlugin({
      options: { 'web-app': 'admin' },
      webApps: { admin: { url: { authorizer: 'aws_iam' } } },
      outputs: [{ OutputKey: 'AdminWebFunctionUrl', OutputValue: API_URL }],
    })
    await expect(plugin.hooks['invoke:invoke']()).resolves.toBeUndefined()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][1].redirect).toBe('manual')
    expect(logger.notice).toHaveBeenCalledWith('HTTP 302 Found')
    expect(logger.aside).toHaveBeenCalledWith(
      'location: https://elsewhere.example.com/login',
    )
  })

  it('a stack that does not exist: the web app is not deployed', async () => {
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeStacks: async () => {
        throw Object.assign(
          new Error('Stack with id shop-dev does not exist'),
          { providerError: { code: 'ValidationError' } },
        )
      },
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'WEB_APPS_NOT_DEPLOYED',
      stack: undefined,
      message:
        'Web app "api" has no endpoint in stack "shop-dev". Deploy the service with serverless deploy first.',
    })
  })

  it('other stack lookup failures pass through unchanged', async () => {
    const original = new Error('Rate exceeded')
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeStacks: async () => {
        throw original
      },
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toBe(original)
  })

  it('a lookup failure that names another missing resource passes through unchanged', async () => {
    const original = new Error(
      'Role arn:aws:iam::123456789012:role/deployer does not exist',
    )
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeStacks: async () => {
        throw original
      },
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toBe(original)
  })

  it('a request that cannot be sent names the web app, the URL and the cause', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed', {
        cause: new Error(
          'getaddrinfo ENOTFOUND abc123.lambda-web.us-east-1.on.aws',
        ),
      })
    })
    const { plugin } = makePlugin({
      options: { 'web-app': 'api', path: '/health' },
    })
    await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'WEB_APPS_INVOKE_REQUEST_FAILED',
      stack: undefined,
      message: `Could not reach web app "api" at ${API_URL}/health: getaddrinfo ENOTFOUND abc123.lambda-web.us-east-1.on.aws`,
    })
  })

  // The signature must cover exactly the path and query on the wire. The expected
  // value is computed here from the SigV4 rules, independently of the signer:
  // each path segment encoded once more (non-S3 services), query pairs decoded
  // from the raw string (`+` stays `+`, so it signs as %2B), sorted by key and
  // then by encoded pair.
  it('signs the path and query exactly as sent', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask'] })
    global.fetch = jest.fn(async () => respond('ok'))
    const { plugin } = makePlugin({
      options: {
        'web-app': 'admin',
        path: '/files/a b?q=a+b&tag=z&tag=a&empty&sp=x%20y',
      },
      webApps: { admin: { url: { authorizer: 'aws_iam' } } },
      outputs: [{ OutputKey: 'AdminWebFunctionUrl', OutputValue: API_URL }],
    })
    await plugin.hooks['invoke:invoke']()
    const [url, init] = global.fetch.mock.calls[0]
    expect(String(url)).toBe(
      `${API_URL}/files/a%20b?q=a+b&tag=z&tag=a&empty&sp=x%20y`,
    )

    const amzDate = '20261015T100000Z'
    const date = '20261015'
    const host = new URL(API_URL).host
    const payloadHash = sha256('')
    const signedHeaders =
      'host;x-amz-content-sha256;x-amz-date;x-amz-security-token'
    const canonicalRequest = [
      'GET',
      '/files/a%2520b',
      'empty=&q=a%2Bb&sp=x%20y&tag=a&tag=z',
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      'x-amz-security-token:session-token',
      '',
      signedHeaders,
      payloadHash,
    ].join('\n')
    const scope = `${date}/us-east-1/lambda/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n')
    const hmac = (key, value) =>
      createHmac('sha256', key).update(value).digest()
    const signingKey = hmac(
      hmac(hmac(hmac('AWS4secret', date), 'us-east-1'), 'lambda'),
      'aws4_request',
    )
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex')
    expect(init.headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    )
  })

  describe('--header', () => {
    it('sends each header with a request to a public endpoint', async () => {
      global.fetch = jest.fn(async () => respond('ok'))
      const { plugin } = makePlugin({
        options: {
          'web-app': 'api',
          method: 'POST',
          data: '{"a":1}',
          header: [
            'Content-Type: application/json',
            'X-Trace:abc ',
            'Accept: text/html',
            'accept: application/json',
            'X-Empty:',
          ],
        },
      })
      await plugin.hooks['invoke:invoke']()
      const [, init] = global.fetch.mock.calls[0]
      expect(init.body).toBe('{"a":1}')
      expect({ ...init.headers }).toEqual({
        'content-type': 'application/json',
        'x-trace': 'abc',
        accept: 'text/html, application/json',
        'x-empty': '',
      })
    })

    it('lets a public endpoint get an Authorization header of its own', async () => {
      global.fetch = jest.fn(async () => respond('ok'))
      const { plugin } = makePlugin({
        options: { 'web-app': 'api', header: 'Authorization: Bearer abc' },
      })
      await plugin.hooks['invoke:invoke']()
      expect(global.fetch.mock.calls[0][1].headers.authorization).toBe(
        'Bearer abc',
      )
    })

    // Computed from the SigV4 rules, independently of the signer, as above.
    it('signs the headers with a request to an aws_iam endpoint', async () => {
      jest.useFakeTimers({
        now: NOW,
        doNotFake: ['nextTick', 'queueMicrotask'],
      })
      global.fetch = jest.fn(async () => respond('ok'))
      const body = '{"a":1}'
      const { plugin } = makePlugin({
        options: {
          'web-app': 'admin',
          path: '/orders',
          method: 'POST',
          data: body,
          header: ['Content-Type: application/json', 'X-Trace: abc'],
        },
        webApps: { admin: { url: { authorizer: 'aws_iam' } } },
        outputs: [{ OutputKey: 'AdminWebFunctionUrl', OutputValue: API_URL }],
      })
      await plugin.hooks['invoke:invoke']()
      const [, init] = global.fetch.mock.calls[0]
      expect(init.headers['content-type']).toBe('application/json')
      expect(init.headers['x-trace']).toBe('abc')

      const amzDate = '20261015T100000Z'
      const date = '20261015'
      const payloadHash = sha256(body)
      const signedHeaders =
        'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token;x-trace'
      const canonicalRequest = [
        'POST',
        '/orders',
        '',
        'content-type:application/json',
        `host:${new URL(API_URL).host}`,
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${amzDate}`,
        'x-amz-security-token:session-token',
        'x-trace:abc',
        '',
        signedHeaders,
        payloadHash,
      ].join('\n')
      const scope = `${date}/us-east-1/lambda/aws4_request`
      const hmac = (key, value) =>
        createHmac('sha256', key).update(value).digest()
      const signingKey = hmac(
        hmac(hmac(hmac('AWS4secret', date), 'us-east-1'), 'lambda'),
        'aws4_request',
      )
      const signature = createHmac('sha256', signingKey)
        .update(
          ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join(
            '\n',
          ),
        )
        .digest('hex')
      expect(init.headers.authorization).toBe(
        `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      )
    })

    it.each([
      'Content-Type application/json',
      ': value',
      'Bad Name: value',
      'X-Line: a\r\nX-Other: b',
    ])('stops on a malformed header %p before any request', async (header) => {
      global.fetch = jest.fn()
      const { plugin, request } = makePlugin({
        options: { 'web-app': 'api', header: [header] },
      })
      await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
        code: 'INVOKE_INVALID_HEADER',
        stack: undefined,
        message:
          "Each --header must be one line in the form 'Name: value', for example --header 'Content-Type: application/json'.",
      })
      expect(request).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it.each(['X-Name: żółw', 'X-Name: café'])(
      'stops on a non-ASCII header value %p before any request',
      async (header) => {
        global.fetch = jest.fn()
        const { plugin, request } = makePlugin({
          options: { 'web-app': 'api', header: [header] },
        })
        await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'INVOKE_INVALID_HEADER',
          stack: undefined,
          message:
            'The --header X-Name value must be printable ASCII text. Encode other characters first, for example with encodeURIComponent.',
        })
        expect(request).not.toHaveBeenCalled()
        expect(global.fetch).not.toHaveBeenCalled()
      },
    )

    it('rejects Host on any endpoint', async () => {
      global.fetch = jest.fn()
      const { plugin } = makePlugin({
        options: { 'web-app': 'api', header: ['Host: example.com'] },
      })
      await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
        code: 'INVOKE_RESERVED_HEADER',
        stack: undefined,
        message:
          "--header cannot set Host: the Framework sets it from the web app's endpoint.",
      })
    })

    it.each([
      'Authorization',
      'X-Amz-Date',
      'X-Amz-Security-Token',
      'X-Amz-Content-Sha256',
    ])('rejects %s on a signed endpoint', async (name) => {
      global.fetch = jest.fn()
      const { plugin, request } = makePlugin({
        options: { 'web-app': 'api', header: [`${name}: x`] },
        providerConfig: {
          domains: [{ name: 'shop.example.com', webApp: 'api' }],
        },
      })
      await expect(plugin.hooks['invoke:invoke']()).rejects.toMatchObject({
        code: 'INVOKE_RESERVED_HEADER',
        stack: undefined,
        message: `--header cannot set ${name}: the Framework sets it to sign the request.`,
      })
      expect(request).not.toHaveBeenCalled()
    })
  })

  describe('--log', () => {
    const run = async (plugin) => {
      const done = plugin.hooks['invoke:invoke']()
      let settled = false
      done.then(
        () => (settled = true),
        () => (settled = true),
      )
      for (let i = 0; i < 40 && !settled; i += 1) {
        await jest.advanceTimersByTimeAsync(1000)
      }
      return done
    }

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW })
    })

    it('polls the .local group every second and prints the lines in timestamp order after one more poll', async () => {
      global.fetch = jest.fn(async () => respond('ok'))
      const polls = []
      const filterLogEvents = async (params) => {
        polls.push({ ...params, at: Date.now() })
        const poll = polls.filter((p) => !p.nextToken).length
        if (poll < 3)
          return {
            events: [],
            nextToken: params.nextToken ? undefined : 'empty-page',
          }
        if (poll === 3 && !params.nextToken) {
          return {
            events: [
              { eventId: 'b', timestamp: NOW + 2, message: 'second' },
              { eventId: 'a', timestamp: NOW + 1, message: 'first' },
            ],
          }
        }
        return {
          events: [
            { eventId: 'a', timestamp: NOW + 1, message: 'first' },
            { eventId: 'c', timestamp: NOW + 3, message: 'third' },
          ],
        }
      }
      const { plugin, logger } = makePlugin({
        options: { 'web-app': 'api', log: true },
        filterLogEvents,
      })
      await run(plugin)

      expect(polls[0]).toEqual({
        logGroupName: '/aws/lambda/web/shop-dev-api.local',
        logStreamNamePrefix: LOG_STREAM,
        filterPattern: `{ ($.requestId = "${REQUEST_ID}") || ($.record.requestId = "${REQUEST_ID}") }`,
        startTime: NOW - 5000,
        at: NOW + 1000,
      })
      // Empty pages still carry a token, which is followed.
      expect(polls[1]).toMatchObject({ nextToken: 'empty-page' })
      const firstPagePolls = polls.filter((p) => !p.nextToken)
      expect(firstPagePolls.map((p) => p.at - NOW)).toEqual([
        1000, 2000, 3000, 4000,
      ])
      const printed = logger.aside.mock.calls
        .map(([line]) => line)
        .filter((line) => ['first', 'second', 'third'].includes(line))
      expect(printed).toEqual(['first', 'second', 'third'])
    })

    it('stops after 30 seconds without lines and points to serverless logs, without failing', async () => {
      global.fetch = jest.fn(async () => respond('ok'))
      let polls = 0
      const { plugin, logger } = makePlugin({
        options: { 'web-app': 'api', log: true },
        filterLogEvents: async () => {
          polls += 1
          return { events: [] }
        },
      })
      await expect(run(plugin)).resolves.toBeUndefined()
      expect(polls).toBe(30)
      expect(logger.notice).toHaveBeenCalledWith(
        'No log lines for this request arrived within 30 seconds. Run "serverless logs --web-app api" to see the web app\'s logs.',
      )
    })

    it('treats a missing log group or stream as not yet', async () => {
      global.fetch = jest.fn(async () => respond('ok'))
      let polls = 0
      const { plugin, logger } = makePlugin({
        options: { 'web-app': 'api', log: true },
        filterLogEvents: async () => {
          polls += 1
          if (polls === 1) {
            throw Object.assign(
              new Error('The specified log group does not exist.'),
              {
                providerError: { code: 'ResourceNotFoundException' },
              },
            )
          }
          return {
            events: [{ eventId: 'a', timestamp: NOW, message: 'hello' }],
          }
        },
      })
      await run(plugin)
      expect(polls).toBe(3)
      expect(logger.aside).toHaveBeenCalledWith('hello')
    })

    it('prints the lines of a failed request before failing', async () => {
      global.fetch = jest.fn(async () => respond('boom', { status: 500 }))
      const { plugin, logger } = makePlugin({
        options: { 'web-app': 'api', log: true },
        filterLogEvents: async () => ({
          events: [{ eventId: 'a', timestamp: NOW, message: 'crashed' }],
        }),
      })
      await expect(run(plugin)).rejects.toMatchObject({
        code: 'WEB_APPS_INVOKE_HTTP_ERROR',
        stack: undefined,
      })
      expect(logger.aside).toHaveBeenCalledWith('crashed')
    })
  })
})
