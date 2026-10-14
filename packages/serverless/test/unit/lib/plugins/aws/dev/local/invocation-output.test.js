import { afterEach, describe, expect, jest, test } from '@jest/globals'
import {
  getColorSettingsForTests,
  setColorSettingsForTests,
  stringToSafeColor,
  style,
} from '@serverless/util/src/logger/index.js'
import {
  callerReceived,
  createBodyChunkCounter,
  createInvocationOutput,
  errorStatusCode,
  eventLabel,
  outcomeOf,
  preludeStatusCode,
  resourceShortName,
  shortId,
  shortLabel,
  userFrames,
} from '../../../../../../../lib/plugins/aws/dev/local/invocation-output.js'

// Every test runs without colour unless it turns colour on; each puts the logger's level back.
const colorSettings = getColorSettingsForTests()
afterEach(() => setColorSettingsForTests(colorSettings))
const withoutColor = () =>
  setColorSettingsForTests({ chalkLevel: 0, colorSupportLevel: 0 })
const withColor = () =>
  setColorSettingsForTests({ chalkLevel: 3, colorSupportLevel: 3 })

const ID = '3f2a9c1e-5b7d-4f0e-9a1c-0d2e3f4a5b6c'
const OTHER = '77e0b3aa-0000-4000-8000-000000000000'
const httpV2 = (
  method = 'POST',
  path = '/orders',
  domainName = 'a1b2c3.execute-api.us-east-1.amazonaws.com',
) => ({
  version: '2.0',
  routeKey: `${method} ${path}`,
  requestContext: { domainName, http: { method, path } },
})
// API Gateway HTTP API, payload format 1.0.
const httpV1 = (method = 'GET', path = '/orders') => ({
  version: '1.0',
  resource: path,
  path,
  httpMethod: method,
  requestContext: {
    apiId: 'a1b2c3',
    domainName: 'a1b2c3.execute-api.us-east-1.amazonaws.com',
    httpMethod: method,
    resourcePath: path,
  },
})
const sqs = (count) => ({
  Records: Array.from({ length: count }, (_, i) => ({
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:payments-queue',
    messageId: `m${i}`,
  })),
})
const response = (value) => ({
  kind: 'response',
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify(value)),
})
const failure = (body, kind = 'error') => ({
  kind,
  errorType: body.errorType,
  body: Buffer.from(JSON.stringify(body)),
})
const prelude = (metadata, text = '') =>
  Buffer.concat([
    Buffer.from(JSON.stringify(metadata)),
    Buffer.alloc(8),
    Buffer.from(text),
  ])
const capture = (options = {}) => {
  withoutColor()
  const lines = []
  const warnings = []
  // Where each blank line goes: before the line at that index.
  const blanks = []
  const output = createInvocationOutput({
    write: (line) => lines.push(line),
    warn: (line) => warnings.push(line),
    blank: () => blanks.push(lines.length),
    ...options,
  })
  return { output, lines, warnings, blanks }
}

describe('eventLabel', () => {
  test.each([
    [
      'REST API',
      { httpMethod: 'GET', path: '/orders', requestContext: {} },
      'aws:apigateway:v1:get:/orders',
    ],
    ['HTTP API', httpV2(), 'aws:apigateway:v2:post:/orders'],
    [
      'HTTP API with payload format 1.0',
      {
        version: '1.0',
        httpMethod: 'POST',
        path: '/orders',
        requestContext: {},
      },
      'aws:apigateway:v2:post:/orders',
    ],
    [
      'Application Load Balancer',
      {
        httpMethod: 'GET',
        path: '/orders',
        requestContext: {
          elb: {
            targetGroupArn:
              'arn:aws:elasticloadbalancing:us-east-1:1:targetgroup/orders/1',
          },
        },
      },
      'aws:alb:get:/orders',
    ],
    [
      'function URL',
      httpV2('GET', '/', 'abc.lambda-url.us-east-1.on.aws'),
      'aws:lambda-url:get:/',
    ],
    [
      'EventBridge',
      { source: 'orders', 'detail-type': 'OrderPlaced' },
      'aws:eventbridge:orders:OrderPlaced',
    ],
    [
      'schedule',
      {
        source: 'aws.events',
        'detail-type': 'Scheduled Event',
        resources: [
          'arn:aws:events:us-east-1:123456789012:rule/nightly-report',
        ],
      },
      'aws:schedule:nightly-report',
    ],
    ['one SQS message', sqs(1), 'aws:sqs:payments-queue:m0'],
    ['an SQS batch', sqs(3), 'aws:sqs:payments-queue · 3 messages'],
    [
      'SNS',
      {
        Records: [
          {
            EventSource: 'aws:sns',
            Sns: { TopicArn: 'arn:aws:sns:us-east-1:1:topic', MessageId: 'n1' },
          },
        ],
      },
      'aws:sns:topic:n1',
    ],
    [
      'S3',
      {
        Records: [
          {
            eventSource: 'aws:s3',
            eventName: 'ObjectCreated:Put',
            s3: { bucket: { name: 'uploads' } },
          },
        ],
      },
      'aws:s3:uploads:ObjectCreated:Put',
    ],
    [
      'DynamoDB',
      {
        Records: [
          {
            eventSource: 'aws:dynamodb',
            eventSourceARN:
              'arn:aws:dynamodb:us-east-1:1:table/Orders/stream/2026',
          },
          {
            eventSource: 'aws:dynamodb',
            eventSourceARN:
              'arn:aws:dynamodb:us-east-1:1:table/Orders/stream/2026',
          },
        ],
      },
      'aws:dynamodb:Orders · 2 records',
    ],
    [
      'Kinesis',
      {
        Records: [
          {
            eventSource: 'aws:kinesis',
            eventSourceARN: 'arn:aws:kinesis:us-east-1:1:stream/clicks',
          },
        ],
      },
      'aws:kinesis:clicks · 1 record',
    ],
    ['a direct invoke', { orderId: 'o1' }, 'direct invoke'],
    ['a non-object event', 'text', 'direct invoke'],
    ['no event', undefined, 'direct invoke'],
  ])('%s', (name, event, label) => {
    expect(eventLabel(event)).toBe(label)
  })

  test('an MCP server shows the JSON-RPC call', () => {
    const event = {
      httpMethod: 'POST',
      path: '/crm/mcp',
      requestContext: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_weather' },
        id: 1,
      }),
    }
    expect(eventLabel(event, { mcp: true })).toBe('mcp tools/call get_weather')
    expect(eventLabel(event)).toBe('aws:apigateway:v1:post:/crm/mcp')
  })

  test('control characters from the event never reach the terminal', () => {
    expect(
      eventLabel({
        httpMethod: 'GET',
        path: '/a\u001b[2Jb',
        requestContext: {},
      }),
    ).toBe('aws:apigateway:v1:get:/ab')
  })
})

describe('shortLabel', () => {
  const PREFIXES = ['svc-dev-']
  test.each([
    [
      'REST API',
      { httpMethod: 'GET', path: '/orders', requestContext: {} },
      'GET /orders',
    ],
    ['HTTP API', httpV2(), 'POST /orders'],
    ['HTTP API, payload 1.0', httpV1(), 'GET /orders'],
    [
      'function URL',
      httpV2('get', '/', 'abc.lambda-url.us-east-1.on.aws'),
      'GET /',
    ],
    [
      'EventBridge',
      { source: 'orders', 'detail-type': 'OrderPlaced' },
      'EventBridge OrderPlaced',
    ],
    [
      'schedule',
      {
        source: 'aws.events',
        'detail-type': 'Scheduled Event',
        resources: [
          'arn:aws:events:us-east-1:123456789012:rule/svc-dev-NightlyReportRule-A1B2C3D4E5F6',
        ],
      },
      'schedule NightlyReportRule',
    ],
    ['one SQS message', sqs(1), 'SQS payments-queue'],
    ['an SQS batch', sqs(3), 'SQS payments-queue · 3 messages'],
    [
      'an SQS queue CloudFormation named',
      {
        Records: [
          {
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:svc-dev-JobsQueue-i0PzaO617EMJ',
          },
        ],
      },
      'SQS JobsQueue',
    ],
    [
      'SNS',
      {
        Records: [
          {
            EventSource: 'aws:sns',
            Sns: { TopicArn: 'arn:aws:sns:us-east-1:1:svc-dev-alerts' },
          },
        ],
      },
      'SNS alerts',
    ],
    [
      'S3',
      {
        Records: [
          {
            eventSource: 'aws:s3',
            eventName: 'ObjectCreated:Put',
            s3: { bucket: { name: 'uploads' } },
          },
        ],
      },
      'S3 uploads ObjectCreated:Put',
    ],
    [
      'DynamoDB',
      {
        Records: [
          {
            eventSource: 'aws:dynamodb',
            eventSourceARN:
              'arn:aws:dynamodb:us-east-1:1:table/Orders/stream/2026',
          },
          {
            eventSource: 'aws:dynamodb',
            eventSourceARN:
              'arn:aws:dynamodb:us-east-1:1:table/Orders/stream/2026',
          },
        ],
      },
      'DynamoDB Orders · 2 records',
    ],
    [
      'Kinesis',
      {
        Records: [
          {
            eventSource: 'aws:kinesis',
            eventSourceARN: 'arn:aws:kinesis:us-east-1:1:stream/clicks',
          },
        ],
      },
      'Kinesis clicks',
    ],
    ['a direct invoke', { orderId: 'o1' }, 'direct invoke'],
    ['no event', undefined, 'direct invoke'],
  ])('%s', (name, event, label) => {
    expect(shortLabel(event, { prefixes: PREFIXES })).toBe(label)
  })

  test('an MCP server keeps the JSON-RPC call', () => {
    const event = {
      httpMethod: 'POST',
      path: '/crm/mcp',
      requestContext: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_weather' },
      }),
    }
    expect(shortLabel(event, { mcp: true })).toBe('mcp tools/call get_weather')
  })

  test('control characters from the event never reach the terminal', () => {
    expect(
      shortLabel({
        httpMethod: 'GET',
        path: '/a\u001b[2Jb',
        requestContext: {},
      }),
    ).toBe('GET /ab')
  })
})

describe('resourceShortName', () => {
  test.each([
    [
      'the stack prefix and the generated suffix',
      'svc-dev-JobsQueue-i0PzaO617EMJ',
      'JobsQueue',
    ],
    ['an older, capital suffix', 'svc-dev-Jobs-1A2B3C4D5E6F7', 'Jobs'],
    ['the stack prefix of a name someone chose', 'svc-dev-jobs', 'jobs'],
    [
      'a lowercase word is not a generated suffix',
      'svc-dev-order-notification',
      'order-notification',
    ],
    [
      'a lowercase suffix is shown: it may be a name someone chose',
      'svc-dev-uploadsbucket-1a2b3c4d5e6f',
      'uploadsbucket-1a2b3c4d5e6f',
    ],
    [
      'an account id after the name is part of it',
      'svc-dev-uploads-123456789012',
      'uploads-123456789012',
    ],
    [
      'a timestamp after the name is part of it',
      'svc-dev-jobs-202610121530',
      'jobs-202610121530',
    ],
    [
      'a word with digits someone chose is part of the name',
      'svc-dev-exports-2026q4report',
      'exports-2026q4report',
    ],
    [
      'a lowercase hash is part of the name',
      'svc-dev-cache-sha256abcdef',
      'cache-sha256abcdef',
    ],
    [
      'a capitalized word without digits is part of the name',
      'svc-dev-reports-MonthlyTotal',
      'reports-MonthlyTotal',
    ],
    [
      'a suffix needs a logical id before it',
      'svc-dev-my-jobs-i0PzaO617EMJ',
      'my-jobs-i0PzaO617EMJ',
    ],
    [
      'a FIFO queue CloudFormation named keeps .fifo',
      'svc-dev-JobsQueue-i0PzaO617EMJ.fifo',
      'JobsQueue.fifo',
    ],
    ['a FIFO queue someone named', 'svc-dev-jobs.fifo', 'jobs.fifo'],
    [
      'no prefix: the name as it is',
      'payments-JobsQueue-i0PzaO617EMJ',
      'payments-JobsQueue-i0PzaO617EMJ',
    ],
    ['the prefix alone is the name', 'svc-dev-', 'svc-dev-'],
  ])('%s', (name, resource, shown) => {
    expect(resourceShortName(resource, ['svc-dev-'])).toBe(shown)
  })
})

describe('outcomeOf', () => {
  test.each([
    [{ statusCode: 201 }, { tone: 'ok', text: '(201)' }],
    [{ statusCode: 404 }, { tone: 'partial', text: '(404)' }],
    [{ statusCode: 502 }, { tone: 'error', text: '(502)' }],
    [{ anything: 1 }, { tone: 'ok', text: '(ok)' }],
  ])('a response %p is %p', (value, expected) => {
    expect(outcomeOf({ reply: response(value) })).toEqual(expected)
  })

  test('a partial batch counts what was returned', () => {
    expect(
      outcomeOf({
        reply: response({ batchItemFailures: [{ itemIdentifier: 'm2' }] }),
        event: sqs(3),
      }),
    ).toEqual({
      tone: 'partial',
      text: '(partial) 2/3 ok, 1 returned as batchItemFailures',
    })
  })

  test('function errors and init errors carry the error', () => {
    const body = {
      errorType: 'TypeError',
      errorMessage: 'bad',
      trace: ['TypeError: bad'],
    }
    expect(outcomeOf({ reply: failure(body) })).toEqual({
      tone: 'error',
      error: { type: 'TypeError', message: 'bad', trace: ['TypeError: bad'] },
    })
    expect(
      outcomeOf({
        reply: failure(
          {
            errorType: 'Runtime.ImportModuleError',
            errorMessage: 'x',
            stackTrace: [],
          },
          'init_error',
        ),
      }).error.type,
    ).toBe('Runtime.ImportModuleError')
  })

  test('a stream reads its status from the HTTP prelude', () => {
    const contentType = 'application/vnd.awslambda.http-integration-response'
    expect(
      outcomeOf({
        reply: { kind: 'stream', contentType },
        contentType,
        head: prelude({ statusCode: 200 }, 'x'),
        trailers: { errorType: null },
      }),
    ).toEqual({ tone: 'ok', text: '(200)' })
    expect(
      outcomeOf({
        reply: { kind: 'stream', contentType: 'text/plain' },
        head: Buffer.from('x'),
      }),
    ).toEqual({ tone: 'ok', text: '(ok)' })
  })

  test('a stream that ended with error trailers is a failure', () => {
    const errorBody = Buffer.from(
      JSON.stringify({
        errorType: 'Error',
        errorMessage: 'mid-stream',
        trace: [],
      }),
    ).toString('base64')
    expect(
      outcomeOf({
        reply: { kind: 'stream', contentType: 'text/plain' },
        trailers: { errorType: 'Error', errorBody },
      }),
    ).toEqual({
      tone: 'error',
      error: { type: 'Error', message: 'mid-stream', trace: [] },
    })
  })
})

describe('preludeStatusCode', () => {
  test('reads the status before the eight NUL bytes, for the prelude content type only', () => {
    const contentType = 'application/vnd.awslambda.http-integration-response'
    expect(
      preludeStatusCode({ contentType, head: prelude({ statusCode: 418 }) }),
    ).toBe(418)
    expect(
      preludeStatusCode({
        contentType: 'text/plain',
        head: prelude({ statusCode: 418 }),
      }),
    ).toBeUndefined()
    expect(
      preludeStatusCode({ contentType, head: Buffer.from('{"statusCode":1}') }),
    ).toBeUndefined()
  })
})

describe('createBodyChunkCounter', () => {
  const contentType = 'application/vnd.awslambda.http-integration-response'
  const countOf = (options, chunks) => {
    const counter = createBodyChunkCounter(options)
    for (const chunk of chunks) counter.add(Buffer.from(chunk))
    return counter.count
  }
  const metadata = JSON.stringify({ statusCode: 200 })
  const nul = '\0'.repeat(8)

  test('a prelude written as its own two chunks never counts: only the body the caller receives', () => {
    expect(
      countOf({ contentType }, [
        metadata,
        nul,
        'chunk 0',
        'chunk 1',
        'chunk 2',
      ]),
    ).toBe(3)
  })

  test('a chunk that ends the prelude counts only when body bytes follow in it', () => {
    expect(
      countOf({ contentType }, [`${metadata}${nul}chunk 0`, 'chunk 1']),
    ).toBe(2)
    expect(countOf({ contentType }, [`${metadata}${nul}`, 'chunk 0'])).toBe(1)
    // The delimiter split across two chunks.
    expect(
      countOf({ contentType }, [`${metadata}\0\0\0`, '\0\0\0\0\0', 'chunk 0']),
    ).toBe(1)
  })

  test('a prelude with no body counts nothing', () => {
    expect(countOf({ contentType }, [metadata, nul])).toBe(0)
  })

  test('every chunk counts without the prelude content type, and empty chunks never do', () => {
    expect(countOf({ contentType: 'text/plain' }, ['a', '', 'b'])).toBe(2)
    expect(countOf({}, [metadata, nul, 'a'])).toBe(3)
  })

  test('no delimiter within the limit means there is no prelude: what came is body', () => {
    expect(countOf({ contentType, limit: 8 }, ['0123456789', 'more'])).toBe(2)
    // Every chunk held while waiting for the delimiter counts.
    expect(countOf({ contentType, limit: 8 }, ['abc', 'def', 'ghi'])).toBe(3)
    expect(countOf({ contentType, limit: 8 }, ['abc', 'def', 'ghi', 'j'])).toBe(
      4,
    )
  })
})

describe('userFrames', () => {
  test('keeps the first frames in the code, relative to it, never node_modules or the MCP entry', () => {
    expect(
      userFrames([
        "TypeError: Cannot read properties of undefined (reading 'items')",
        '    at list (/var/task/src/orders/list.ts:27:18)',
        '    at /var/task/node_modules/lib/index.js:1:1',
        '    at /var/task/serverless-mcp/entry.mjs:2:2',
        '    at main (/var/task/src/orders/handler.ts:12:10)',
        '    at node:internal/process/task_queues:95:5',
      ]),
    ).toEqual(['src/orders/list.ts:27:18', 'src/orders/handler.ts:12:10'])
  })

  test('reads Python frames', () => {
    expect(
      userFrames([
        '  File "/var/task/app/handler.py", line 7, in handler\n    raise ValueError("x")\n',
      ]),
    ).toEqual(['app/handler.py:7 in handler'])
  })

  test('a Python error never points into installed packages or the interpreter', () => {
    expect(
      userFrames([
        '  File "/var/task/.venv/lib/python3.12/site-packages/requests/api.py", line 59, in request\n',
        '  File "/var/task/venv/lib/python3.12/helpers.py", line 3, in helper\n',
        '  File "/var/task/vendor/site-packages/pkg/mod.py", line 4, in f\n',
        '  File "/var/task/vendor/dist-packages/pkg/mod.py", line 5, in g\n',
        '  File "/Users/me/.pyenv/versions/3.12.4/lib/python3.12/site-packages/boto3/session.py", line 9, in client\n',
        '  File "/var/lang/lib/python3.12/json/__init__.py", line 346, in loads\n',
        '  File "/var/task/app/orders.py", line 12, in place\n    total = order["total"]\n',
      ]),
    ).toEqual(['app/orders.py:12 in place'])
  })

  test('a Node.js error never points into installed packages or the runtime', () => {
    expect(
      userFrames([
        'Error: boom',
        '    at Object.run (/var/task/.venv/tool.js:1:1)',
        '    at go (/var/task/node_modules/.pnpm/a@1/node_modules/a/index.js:2:2)',
        '    at /Users/me/work/node_modules/b/index.js:3:3',
        '    at Runtime.handleOnce (/var/runtime/index.mjs:4:4)',
        '    at handler (file:///var/task/src/handler.mjs:9:7)',
      ]),
    ).toEqual(['src/handler.mjs:9:7'])
  })

  test('reads a Python syntax error with and without a line number', () => {
    expect(
      userFrames(['  File "/var/task/app/broken.py", line 3\n    def (\n']),
    ).toEqual(['app/broken.py:3'])
    expect(userFrames(['  File "/var/task/app/broken.py"\n'])).toEqual([
      'app/broken.py',
    ])
    // Lambda's Python runtime writes a syntax error's place as File "…" Line N.
    expect(
      userFrames([
        '  File "/var/task/syntax_py.py" Line 1\n    def handler(event, context)\n',
      ]),
    ).toEqual(['syntax_py.py:1'])
  })

  test("a Node.js frame whose path contains a space is the developer's", () => {
    expect(
      userFrames([
        'Error: boom',
        '    at fn (/var/task/a b/x.js:1:2)',
        '    at /var/task/my dir/handler.js:3:7',
        '    at g (/var/task/my dir/node_modules/lib/i.js:4:4)',
      ]),
    ).toEqual(['a b/x.js:1:2', 'my dir/handler.js:3:7'])
  })

  test('control characters in a frame never reach the terminal', () => {
    expect(userFrames(['    at f (/var/task/a\u001b[2Jb.js:1:2)'])).toEqual([
      'ab.js:1:2',
    ])
  })

  test('stops at the limit', () => {
    const trace = Array.from(
      { length: 6 },
      (_, i) => `    at f (/var/task/a.js:${i + 1}:1)`,
    )
    expect(userFrames(trace)).toHaveLength(3)
  })
})

describe('callerReceived', () => {
  // An Application Load Balancer event carries `httpMethod` like a REST API's, and the target group
  // under `requestContext.elb`.
  const alb = {
    httpMethod: 'POST',
    path: '/',
    requestContext: {
      elb: {
        targetGroupArn:
          'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/t/0123456789abcdef',
      },
    },
  }

  test.each([
    [
      { httpMethod: 'GET', path: '/', requestContext: {} },
      '502 Internal server error (API Gateway REST API)',
    ],
    // The load balancer answers a function error with 502 Bad Gateway.
    [alb, '502 Bad Gateway (Application Load Balancer)'],
    [httpV2(), '500 Internal Server Error (API Gateway HTTP API)'],
    // An HTTP API with payload format 1.0 sends a REST API's event shape, with a version.
    [httpV1(), '500 Internal Server Error (API Gateway HTTP API)'],
    [
      httpV2('GET', '/', 'abc.lambda-url.us-east-1.on.aws'),
      // A function URL answers 502 with the body Internal Server Error.
      '502 Internal Server Error (function URL)',
    ],
    [
      sqs(1),
      'the message goes back to the queue and is retried when it becomes visible again',
    ],
    [
      sqs(3),
      'the 3 messages go back to the queue and are retried when they become visible again',
    ],
    [
      { Records: [{ eventSource: 'aws:kinesis' }] },
      'Lambda retries the batch from the stream',
    ],
    [
      { source: 'orders', 'detail-type': 'OrderPlaced' },
      'Lambda retries the asynchronous event (up to 2 more times by default)',
    ],
    // Nothing tells a synchronous invoke from an asynchronous one, which Lambda retries.
    [
      { orderId: 'o1' },
      'the function error (X-Amz-Function-Error: Unhandled); an asynchronous invocation is retried instead (up to 2 more times by default)',
    ],
  ])('%p → %s', (event, text) => {
    expect(callerReceived(event)).toBe(text)
  })

  // Once a response stream has started, its status and first chunks are already with the caller.
  test.each([
    [
      httpV2('POST', '/', 'abc.lambda-url.us-east-1.on.aws'),
      { streamed: true, statusCode: 201 },
      'status 201 and the chunks sent before the error, with no error: a function URL reports none once the response has started',
    ],
    [
      httpV2('POST', '/', 'abc.lambda-url.us-east-1.on.aws'),
      { streamed: true },
      'status 200 and the chunks sent before the error, with no error: a function URL reports none once the response has started',
    ],
    // API Gateway starts a streamed response once it has the prelude, so the status is the prelude's;
    // the function error then cuts the connection before the response ends (seen live, deployed and
    // relayed alike).
    [
      { httpMethod: 'POST', path: '/crm/mcp', requestContext: {} },
      { streamed: true, statusCode: 202 },
      'status 202 and the chunks sent before the error, then the connection is cut before the response ends, when the integration streams (API Gateway REST API)',
    ],
    // AWS documents no default status when the prelude sets none: none is named.
    [
      { httpMethod: 'POST', path: '/crm/mcp', requestContext: {} },
      { streamed: true },
      'the chunks sent before the error, then the connection is cut before the response ends, when the integration streams (API Gateway REST API)',
    ],
    [
      httpV1(),
      { streamed: true, statusCode: 202 },
      'API Gateway HTTP API invokes with a buffered Invoke, which got the chunks sent before the error and no function error',
    ],
    // HTTP APIs and load balancers invoke with a buffered Invoke, never a stream.
    [
      httpV2(),
      { streamed: true, statusCode: 202 },
      'API Gateway HTTP API invokes with a buffered Invoke, which got the chunks sent before the error and no function error',
    ],
    [
      alb,
      { streamed: true },
      'an Application Load Balancer invokes with a buffered Invoke, which got the chunks sent before the error and no function error',
    ],
    [
      { orderId: 'o1' },
      { streamed: true },
      "the chunks sent before the error, then the error in the stream's last event (InvokeWithResponseStream); a buffered Invoke gets the chunks and no error",
    ],
    [
      httpV2('POST', '/', 'abc.lambda-url.us-east-1.on.aws'),
      { streamed: false },
      '502 Internal Server Error (function URL)',
    ],
  ])(
    'a stream that failed after it started: %p %p → %s',
    (event, how, text) => {
      expect(callerReceived(event, how)).toBe(text)
    },
  )
})

describe('createInvocationOutput', () => {
  test('without colour: the start, log and end lines carry the request id', () => {
    const { output, lines } = capture()
    output.start({
      functionKey: 'createOrder',
      requestId: ID,
      event: httpV2(),
      newWorker: true,
    })
    output.log({
      functionKey: 'createOrder',
      requestId: ID,
      text: 'validating order',
    })
    output.end({
      functionKey: 'createOrder',
      requestId: ID,
      event: httpV2(),
      reply: response({ statusCode: 201 }),
      durationMs: 142,
      initMs: 210,
    })
    expect(lines).toEqual([
      '→ λ createOrder ── POST /orders · 3f2a9c1e',
      '3f2a9c1e │ validating order',
      '← λ createOrder (201) 142ms · cold start 210ms · 3f2a9c1e',
    ])
  })

  test("with colour: the request's colour on the arrows and the bar, the id before the bar while invocations overlap", () => {
    const { output, lines } = capture()
    withColor()
    output.start({ functionKey: 'a', requestId: ID, event: {} })
    output.log({ functionKey: 'a', requestId: ID, text: 'alone' })
    output.start({ functionKey: 'b', requestId: OTHER, event: {} })
    output.log({ functionKey: 'a', requestId: ID, text: 'together' })
    const hue = stringToSafeColor(ID)
    expect(lines[0]).toBe(
      `${hue('→')} λ a ── direct invoke ${style.aside('· 3f2a9c1e')}`,
    )
    expect(lines[1]).toBe(`${hue('│')} alone`)
    expect(lines[3]).toBe(`${hue(`${shortId(ID)} │`)} together`)
  })

  test('with colour: the status in the success or error colour, the details aside', () => {
    const { output, lines } = capture()
    withColor()
    output.end({
      functionKey: 'a',
      requestId: ID,
      event: {},
      reply: response({ statusCode: 202 }),
      durationMs: 5,
    })
    output.end({
      functionKey: 'a',
      requestId: OTHER,
      event: {},
      reply: failure({ errorType: 'TypeError', errorMessage: 'x', trace: [] }),
      durationMs: 7,
      initMs: 90,
    })
    expect(lines[0]).toBe(
      `${stringToSafeColor(ID)('←')} λ a ${style.success('(202)')} ${style.aside('5ms · 3f2a9c1e')}`,
    )
    expect(lines[1]).toBe(
      `${stringToSafeColor(OTHER)('←')} λ a ${style.error('✕ TypeError: x')} ${style.aside('7ms · cold start 90ms · 77e0b3aa')}`,
    )
    expect(style.success('(202)')).not.toBe('(202)')
  })

  test('the colours follow the logger: without colour every line is plain text', () => {
    const { output, lines } = capture()
    output.start({ functionKey: 'a', requestId: ID, event: {} })
    output.end({
      functionKey: 'a',
      requestId: ID,
      event: {},
      reply: response({ statusCode: 500 }),
      durationMs: 5,
    })
    expect(lines.join('\n')).not.toContain('\u001b')
  })

  test('an invocation that overlaps none starts with a blank line, none inside a group', () => {
    const idle = jest.fn()
    const { output, lines, blanks } = capture({ idle })
    const done = (requestId) =>
      output.end({
        functionKey: 'a',
        requestId,
        event: {},
        reply: response({}),
        durationMs: 1,
      })
    output.start({ functionKey: 'a', requestId: ID, event: {} })
    output.start({ functionKey: 'a', requestId: OTHER, event: {} })
    done(ID)
    done(OTHER)
    // No invocation runs once both ended: the session's spinner may come back.
    expect(idle).toHaveBeenCalledTimes(1)
    output.start({ functionKey: 'a', requestId: ID, event: {} })
    expect(lines).toEqual([
      '→ λ a ── direct invoke · 3f2a9c1e',
      '→ λ a ── direct invoke · 77e0b3aa',
      '← λ a (ok) 1ms · 3f2a9c1e',
      '← λ a (ok) 1ms · 77e0b3aa',
      '→ λ a ── direct invoke · 3f2a9c1e',
    ])
    expect(blanks).toEqual([0, 4])
  })

  test('a long label is cut to the terminal width, and never in a pipe', () => {
    const path = `/${'segment/'.repeat(8)}end`
    const narrow = capture({ width: () => 60 })
    narrow.output.start({
      functionKey: 'api',
      requestId: ID,
      event: httpV2('GET', path),
    })
    expect(narrow.lines[0]).toHaveLength(59)
    expect(narrow.lines[0]).toMatch(
      /^→ λ api ── GET \/segment\/.*… · 3f2a9c1e$/,
    )
    const piped = capture({ width: () => 0 })
    piped.output.start({
      functionKey: 'api',
      requestId: ID,
      event: httpV2('GET', path),
    })
    expect(piped.lines[0]).toBe(`→ λ api ── GET ${path} · 3f2a9c1e`)
  })

  test('with details on, the start line shows the full label, never cut', () => {
    const path = `/${'segment/'.repeat(8)}end`
    const { output, lines } = capture({ width: () => 60, detailed: true })
    output.start({
      functionKey: 'api',
      requestId: ID,
      event: httpV2('GET', path),
    })
    expect(lines[0]).toBe(`→ λ api ── aws:apigateway:v2:get:${path} · 3f2a9c1e`)
  })

  test('a label is cut by terminal columns: a wide character takes two, and none is split', () => {
    const wide = capture({ width: () => 40 })
    wide.output.start({
      functionKey: 'api',
      requestId: ID,
      event: { source: 'orders', 'detail-type': '注文'.repeat(20) },
    })
    expect(wide.lines[0]).toBe('→ λ api ── EventBridge 注文… · 3f2a9c1e')
    const emoji = capture({ width: () => 40 })
    emoji.output.start({
      functionKey: 'api',
      requestId: ID,
      event: httpV2('GET', `/${'👩‍💻'.repeat(10)}`),
    })
    expect(emoji.lines[0]).toBe(`→ λ api ── GET /${'👩‍💻'.repeat(5)}… · 3f2a9c1e`)
  })

  describe('a long result line in a terminal', () => {
    const MESSAGE =
      'One or more parameters are invalid. Reason: Message must be shorter than 1048576 bytes.'
    const endWith = (output, { type = 'InvalidParameterValue' } = {}) =>
      output.end({
        functionKey: 'api',
        requestId: ID,
        event: {},
        reply: failure({ errorType: type, errorMessage: MESSAGE, trace: [] }),
        durationMs: 1300,
      })

    test('loses the end of the error message first and keeps the request id', () => {
      const { output, lines } = capture({ width: () => 80 })
      endWith(output)
      expect(lines[0]).toHaveLength(79)
      expect(lines[0]).toMatch(
        /^← λ api ✕ InvalidParameterValue: One or more parameters .*… 1\.3s · 3f2a9c1e$/,
      )
    })

    test('loses the end of a long error type once the message is gone', () => {
      const { output, lines } = capture({ width: () => 40 })
      endWith(output, { type: `Invalid${'Parameter'.repeat(6)}` })
      expect(lines[0]).toHaveLength(39)
      expect(lines[0]).toBe('← λ api ✕ InvalidParam… 1.3s · 3f2a9c1e')
    })

    test('loses the end of a long outcome that is not an error', () => {
      const { output, lines } = capture({ width: () => 50 })
      output.end({
        functionKey: 'worker',
        requestId: ID,
        event: sqs(5),
        reply: response({
          batchItemFailures: [
            { itemIdentifier: 'm1' },
            { itemIdentifier: 'm2' },
          ],
        }),
        durationMs: 12,
      })
      expect(lines[0]).toBe('← λ worker (partial) 3/5 ok, 2 r… 12ms · 3f2a9c1e')
    })

    test('keeps the error mark and one space between parts when the function key fills the width', () => {
      const { output, lines } = capture({ width: () => 30 })
      output.end({
        functionKey: 'a-function-with-a-very-long-name',
        requestId: ID,
        event: {},
        reply: failure({ errorType: 'Boom', errorMessage: MESSAGE, trace: [] }),
        durationMs: 1300,
      })
      expect(lines[0]).toBe(
        '← λ a-function-with-a-very-long-name ✕ 1.3s · 3f2a9c1e',
      )
    })

    test('is never cut in a pipe or with details on', () => {
      const piped = capture({ width: () => 0 })
      endWith(piped.output)
      const detailed = capture({ width: () => 80, detailed: true })
      endWith(detailed.output)
      for (const { lines } of [piped, detailed]) {
        expect(lines[0]).toBe(
          `← λ api ✕ InvalidParameterValue: ${MESSAGE} 1.3s · 3f2a9c1e`,
        )
      }
    })
  })

  test('a long error message is shown in full, without control characters', () => {
    const { output, lines } = capture()
    const role =
      'arn:aws:sts::000000000000:assumed-role/orders-service-dev-us-east-1-lambdaRole/orders-service-dev-createOrder'
    const table =
      'arn:aws:dynamodb:us-east-1:000000000000:table/orders-service-dev-orders-table-with-a-long-descriptive-name'
    const message = `User: ${role} is not authorized to perform: dynamodb:PutItem on resource: ${table} because no identity-based policy allows the dynamodb:PutItem action`
    expect(message.length).toBeGreaterThanOrEqual(300)
    output.end({
      functionKey: 'createOrder',
      requestId: ID,
      event: {},
      reply: failure({
        errorType: 'AccessDeniedException',
        errorMessage: `${message}\u001b[2J\u0007`,
        trace: [],
      }),
      durationMs: 9,
    })
    expect(lines[0]).toBe(
      `← λ createOrder ✕ AccessDeniedException: ${message} 9ms · 3f2a9c1e`,
    )
    expect(lines[0]).toContain('dynamodb:PutItem on resource: ')
    expect(lines[0]).toContain(table)
  })

  test('a stream cut off by its worker says so on the end line', () => {
    const { output, lines } = capture()
    output.end({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: { kind: 'stream', contentType: 'text/plain' },
      durationMs: 40,
      trailers: {
        errorType: 'Runtime.Unknown',
        errorBody: null,
        aborted: true,
      },
      chunks: 1,
      firstByteMs: 10,
      head: Buffer.from('x'),
    })
    expect(lines[0]).toBe(
      '← λ crm ✕ Runtime.Unknown: the response stream ended before the handler finished it 40ms · first byte 10ms, 1 chunk · 3f2a9c1e',
    )
  })

  test('a multi-line error message stays on the end line', () => {
    const { output, lines } = capture()
    output.end({
      functionKey: 'f',
      requestId: ID,
      event: {},
      reply: failure({
        errorType: 'Error',
        errorMessage: 'first\nsecond',
        trace: [],
      }),
      durationMs: 1,
    })
    expect(lines[0]).toBe('← λ f ✕ Error: first second 1ms · 3f2a9c1e')
  })

  test('an error shows on the end line, with the first frames and what the caller received', () => {
    const { output, lines } = capture()
    const event = httpV2('GET', '/orders')
    output.start({ functionKey: 'listOrders', requestId: OTHER, event })
    output.end({
      functionKey: 'listOrders',
      requestId: OTHER,
      event,
      reply: failure({
        errorType: 'TypeError',
        errorMessage: "Cannot read properties of undefined (reading 'items')",
        trace: [
          'TypeError: x',
          '    at list (/var/task/src/orders/list.ts:27:18)',
        ],
      }),
      durationMs: 38,
    })
    expect(lines.slice(1)).toEqual([
      "← λ listOrders ✕ TypeError: Cannot read properties of undefined (reading 'items') 38ms · 77e0b3aa",
      '  ↳ src/orders/list.ts:27:18',
      '  Caller received: 500 Internal Server Error (API Gateway HTTP API)',
    ])
  })

  test('a stream that ended with error trailers is shown as a failure', () => {
    const { output, lines } = capture()
    const errorBody = Buffer.from(
      JSON.stringify({
        errorType: 'Error',
        errorMessage: 'mid-stream',
        trace: [],
      }),
    ).toString('base64')
    output.end({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: { kind: 'stream', contentType: 'text/plain' },
      durationMs: 2400,
      trailers: { errorType: 'Error', errorBody },
      chunks: 4,
      firstByteMs: 180,
      head: Buffer.from('x'),
    })
    expect(lines[0]).toBe(
      '← λ crm ✕ Error: mid-stream 2.4s · first byte 180ms, 4 chunks · 3f2a9c1e',
    )
    expect(lines).toContain(
      "  Caller received: the chunks sent before the error, then the error in the stream's last event (InvokeWithResponseStream); a buffered Invoke gets the chunks and no error",
    )
  })

  test("a function URL stream that failed after it started says the caller got the prelude's status", () => {
    const { output, lines } = capture()
    const contentType = 'application/vnd.awslambda.http-integration-response'
    const errorBody = Buffer.from(
      JSON.stringify({ errorType: 'Error', errorMessage: 'mid-stream' }),
    ).toString('base64')
    output.end({
      functionKey: 'stream',
      requestId: ID,
      event: httpV2('POST', '/', 'abc.lambda-url.us-east-1.on.aws'),
      reply: { kind: 'stream', contentType },
      contentType,
      head: prelude({ statusCode: 202 }, 'x'),
      durationMs: 600,
      trailers: { errorType: 'Error', errorBody },
      chunks: 3,
      firstByteMs: 2,
    })
    expect(lines).toContain(
      '  Caller received: status 202 and the chunks sent before the error, with no error: a function URL reports none once the response has started',
    )
  })

  test('a stream that failed before its first byte keeps the copy of a failed response', () => {
    const { output, lines } = capture()
    output.end({
      functionKey: 'stream',
      requestId: ID,
      event: httpV2('POST', '/', 'abc.lambda-url.us-east-1.on.aws'),
      reply: { kind: 'stream', contentType: 'text/plain' },
      durationMs: 600,
      trailers: { errorType: 'Error', errorBody: null },
      chunks: 0,
      firstByteMs: undefined,
    })
    expect(lines).toContain(
      '  Caller received: 502 Internal Server Error (function URL)',
    )
  })

  test('a streamed answer reports first byte and chunks', () => {
    const { output, lines } = capture()
    const contentType = 'application/vnd.awslambda.http-integration-response'
    output.end({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: { kind: 'stream', contentType },
      contentType,
      head: prelude({ statusCode: 200 }, 'x'),
      durationMs: 2400,
      trailers: { errorType: null, errorBody: null },
      chunks: 1,
      firstByteMs: 180,
    })
    expect(lines).toEqual([
      '← λ crm (200) 2.4s · first byte 180ms, 1 chunk · 3f2a9c1e',
    ])
  })

  test('an MCP server shows a JSON-RPC error a 200 hides', () => {
    const { output, lines } = capture({ mcpFunctions: new Set(['crm']) })
    output.end({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: response({
        statusCode: 200,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Invalid params' },
        }),
      }),
      durationMs: 12,
    })
    expect(lines[0]).toBe(
      '← λ crm (200) ── error -32602: Invalid params 12ms · 3f2a9c1e',
    )
  })

  describe('a streamed MCP reply', () => {
    const contentType = 'application/vnd.awslambda.http-integration-response'
    const rpcError = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Tool noSuchTool not found' },
    })
    // What the end line gets for a stream: the kept head of everything streamed, prelude included.
    const streamEnd = (bodyHead, overrides = {}) => ({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: { kind: 'stream', contentType },
      contentType,
      head: bodyHead,
      bodyHead,
      bodyBytes: bodyHead.length,
      durationMs: 158,
      trailers: { errorType: null, errorBody: null },
      chunks: 1,
      firstByteMs: 150,
      ...overrides,
    })

    test('shows a JSON-RPC error a 200 hides, in a JSON or an SSE body', () => {
      const { output, lines } = capture({ mcpFunctions: new Set(['crm']) })
      output.end(streamEnd(prelude({ statusCode: 200 }, rpcError)))
      output.end(
        streamEnd(
          prelude(
            {
              statusCode: 200,
              headers: { 'content-type': 'text/event-stream' },
            },
            `event: message\ndata: ${rpcError}\n\n`,
          ),
        ),
      )
      expect(lines).toEqual([
        '← λ crm (200) ── error -32602: Tool noSuchTool not found 158ms · first byte 150ms, 1 chunk · 3f2a9c1e',
        '← λ crm (200) ── error -32602: Tool noSuchTool not found 158ms · first byte 150ms, 1 chunk · 3f2a9c1e',
      ])
    })

    test('--detailed prints the response, its credential headers and cookies redacted', () => {
      const { output, lines } = capture({
        detailed: true,
        mcpFunctions: new Set(['crm']),
      })
      output.end(
        streamEnd(
          prelude(
            {
              statusCode: 200,
              headers: { 'set-cookie': 'id=sk-test-1' },
              cookies: ['s=sk-test-2'],
            },
            rpcError,
          ),
        ),
      )
      expect(lines[0]).toBe(
        '← λ crm (200) ── error -32602: Tool noSuchTool not found 158ms · first byte 150ms, 1 chunk · 3f2a9c1e',
      )
      const dumped = lines.slice(1).join('\n')
      expect(dumped).toContain('statusCode: 200')
      expect(dumped).toContain('Tool noSuchTool not found')
      expect(dumped).toContain("'[redacted]'")
      expect(dumped).not.toMatch(/sk-test-/)
    })

    test('past the kept head: no callout and no dump, the end line as for any stream', () => {
      const { output, lines } = capture({
        detailed: true,
        mcpFunctions: new Set(['crm']),
      })
      const bodyHead = prelude({ statusCode: 200 }, rpcError)
      output.end(streamEnd(bodyHead, { bodyBytes: bodyHead.length + 1 }))
      expect(lines).toEqual([
        '← λ crm (200) 158ms · first byte 150ms, 1 chunk · 3f2a9c1e',
      ])
    })

    test('a function that is not an MCP server streams as before: no callout and no dump', () => {
      const { output, lines } = capture({ detailed: true })
      output.end(streamEnd(prelude({ statusCode: 200 }, rpcError)))
      expect(lines).toEqual([
        '← λ crm (200) 158ms · first byte 150ms, 1 chunk · 3f2a9c1e',
      ])
    })
  })

  test('--detailed prints the event and the buffered response', () => {
    const { output, lines } = capture({ detailed: true })
    output.start({
      functionKey: 'api',
      requestId: ID,
      event: { orderId: 'o1' },
    })
    output.end({
      functionKey: 'api',
      requestId: ID,
      event: { orderId: 'o1' },
      reply: response({ ok: true }),
      durationMs: 5,
    })
    expect(lines).toEqual([
      '→ λ api ── direct invoke · 3f2a9c1e',
      "{ orderId: 'o1' }",
      '← λ api (ok) 5ms · 3f2a9c1e',
      '{ ok: true }',
    ])
  })

  test('detailed output names the event as records and invocation files do', () => {
    const { output, lines } = capture({ detailed: true })
    output.start({ functionKey: 'api', requestId: ID, event: httpV2() })
    expect(lines[0]).toBe(
      '→ λ api ── aws:apigateway:v2:post:/orders · 3f2a9c1e',
    )
  })

  test('detailed output can be turned on and off while the session runs', () => {
    const { output, lines } = capture({ detailed: false })
    expect(output.isDetailed()).toBe(false)
    output.start({
      functionKey: 'api',
      requestId: 'aaaaaaaa-1',
      event: { secret: 'no' },
      newWorker: false,
    })
    expect(lines.join('\n')).not.toContain("secret: 'no'")
    expect(output.setDetailed(true)).toBe(true)
    expect(output.isDetailed()).toBe(true)
    output.start({
      functionKey: 'api',
      requestId: 'bbbbbbbb-2',
      event: { shown: 'yes' },
      newWorker: false,
    })
    expect(lines.join('\n')).toContain("shown: 'yes'")
    output.end({
      functionKey: 'api',
      requestId: 'bbbbbbbb-2',
      event: { shown: 'yes' },
      reply: response({ answered: 'yes' }),
      durationMs: 5,
    })
    expect(lines.join('\n')).toContain("answered: 'yes'")
    expect(output.setDetailed(false)).toBe(false)
    output.end({
      functionKey: 'api',
      requestId: 'aaaaaaaa-1',
      event: { secret: 'no' },
      reply: response({ hidden: 'yes' }),
      durationMs: 5,
    })
    expect(lines.join('\n')).not.toContain("hidden: 'yes'")
  })

  test('--detailed redacts credential headers in the event and the response', () => {
    const { output, lines } = capture({ detailed: true })
    const event = {
      ...httpV2(),
      headers: { authorization: 'Bearer sk-test-1' },
      cookies: ['s=sk-test-2'],
    }
    output.start({ functionKey: 'api', requestId: ID, event })
    output.end({
      functionKey: 'api',
      requestId: ID,
      event,
      reply: response({
        statusCode: 200,
        headers: { 'Set-Cookie': 'id=sk-test-3' },
      }),
      durationMs: 5,
    })
    expect(lines.join('\n')).not.toMatch(/sk-test-/)
    expect(lines.join('\n')).toContain("'[redacted]'")
  })

  test('errorStatusCode says what an HTTP caller got for a function error, and nothing for other callers', () => {
    expect(errorStatusCode(httpV2())).toBe(500)
    expect(
      errorStatusCode(httpV2('GET', '/', 'x.lambda-url.us-east-1.on.aws')),
    ).toBe(502)
    expect(errorStatusCode({ httpMethod: 'GET', requestContext: {} })).toBe(502)
    expect(
      errorStatusCode({ httpMethod: 'GET', requestContext: { elb: {} } }),
    ).toBe(502)
    expect(errorStatusCode(sqs(1))).toBeUndefined()
    expect(errorStatusCode(undefined)).toBeUndefined()
    expect(
      errorStatusCode(httpV2('GET', '/', 'x.lambda-url.us-east-1.on.aws'), {
        streamed: true,
      }),
    ).toBe(200)
    expect(errorStatusCode(httpV2(), { streamed: true, statusCode: 201 })).toBe(
      201,
    )
  })

  const pastDeadline = (times) => {
    const { output, warnings } = capture()
    output.end({
      functionKey: 'api',
      requestId: ID,
      event: {},
      reply: response({}),
      deadlineMs: 1000,
      endedAt: 1500,
      timeoutSeconds: 6,
      ...times,
    })
    return warnings
  }

  test('a handler that took most of the timeout: the warning names the deadline and the run, and says to speed it up', () => {
    expect(pastDeadline({ durationMs: 7200 })).toEqual([
      'api ended after its deployed timeout of 6s (handler 7.2s): the caller got a timeout error. Speed up the handler, or raise "timeout" in serverless.yml and deploy.',
    ])
  })

  test('a cold start that took most of the timeout: the warning says the handler process took that long to take the invocation', () => {
    expect(pastDeadline({ durationMs: 3, initMs: 5600 })).toEqual([
      'api ended after its deployed timeout of 6s (cold start 5.6s, handler 3ms): the caller got a timeout error. The handler process took 5.6s to take the invocation.',
    ])
  })

  test('when neither took most of the timeout (the relay did), the warning gives the times and no advice', () => {
    expect(pastDeadline({ durationMs: 900, initMs: 1200 })).toEqual([
      'api ended after its deployed timeout of 6s (cold start 1.2s, handler 900ms): the caller got a timeout error.',
    ])
  })

  test('an MCP server silent past the edge first-byte budget gets a warning', () => {
    const { output, warnings } = capture({
      mcpFunctions: new Set(['crm']),
      provider: {},
    })
    output.end({
      functionKey: 'crm',
      requestId: ID,
      event: {},
      reply: response({ statusCode: 200 }),
      durationMs: 31_000,
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^crm sent nothing for 31\.0s\./)
  })

  test('a worker that exited says so and what happens next', () => {
    const { output, warnings } = capture()
    output.workerExited({
      functionKey: 'createOrder',
      requestId: ID,
      code: 1,
      signal: null,
    })
    output.workerExited({
      functionKey: 'createOrder',
      requestId: ID,
      code: null,
      signal: 'SIGKILL',
    })
    expect(warnings).toEqual([
      'The createOrder handler process exited (exit code 1) during 3f2a9c1e; the next invocation starts a new one.',
      'The createOrder handler process exited (signal SIGKILL) during 3f2a9c1e; the next invocation starts a new one.',
    ])
  })

  test('words never describe a mode as local or cloud', () => {
    const { output, lines, warnings } = capture()
    output.end({
      functionKey: 'f',
      requestId: ID,
      event: sqs(2),
      reply: failure({ errorType: 'E', errorMessage: 'm', trace: [] }),
      durationMs: 1,
      deadlineMs: 1,
      endedAt: 2,
      timeoutSeconds: 1,
    })
    const text = [...lines, ...warnings].join('\n')
    expect(text).not.toMatch(/\b(cloud|locally)\b/i)
  })
})
