import {
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import { spawn } from 'child_process'
import { existsSync, readFileSync, symlinkSync } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRuntimeApi } from '../../../../../../../lib/plugins/aws/dev/local/runtime-api.js'
import {
  CLIENT_FILES,
  clientPath,
  tsxLoaderUrl,
} from '../../../../../../../lib/plugins/aws/dev/local/paths.js'
import { mcpEntrySourcePath } from '../../../../../../../lib/plugins/aws/mcp/lib/packaging.js'
import { buildMcpEntry } from '../../../../../../../scripts/build-mcp-entry.js'
import {
  alive,
  baseEnv,
  cleanTempDirs,
  collect,
  exitWithin,
  invocation,
  killChildren,
  killPid,
  PARENT_PID,
  sleep,
  spawnTracked,
  startWithShortLivedParent,
  tempDir,
  waitFor,
  workerId,
  write,
} from './helpers.js'

jest.setTimeout(60_000)

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
)
let api
afterEach(async () => {
  await killChildren()
  await api?.close()
  api = null
  cleanTempDirs()
})

const clientArgs = ({
  dir,
  handlerFile,
  exportPath,
  deployedRuntime,
  colors,
  loader,
  parentPid,
  ownGroup,
}) => [
  ...(loader ? ['--import', loader] : []),
  clientPath(CLIENT_FILES.node),
  JSON.stringify({
    handlerFile: path.isAbsolute(handlerFile)
      ? handlerFile
      : path.join(dir, handlerFile),
    exportPath,
    taskRoot: dir,
    serviceDir: dir,
    deployedRuntime,
    colors,
    ...(parentPid !== undefined && { parentPid }),
    ...(ownGroup !== undefined && { ownGroup }),
  }),
]
const lambdaEnv = (channel, env = {}) => ({
  ...baseEnv(),
  AWS_LAMBDA_RUNTIME_API: channel.address,
  AWS_LAMBDA_FUNCTION_NAME: 'svc-dev-api',
  AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '1024',
  AWS_LAMBDA_LOG_GROUP_NAME: '/aws/lambda/svc-dev-api',
  AWS_LAMBDA_LOG_STREAM_NAME: '2026/10/01/[$LATEST]abc',
  ...env,
})
const startApi = async () => {
  if (!api) {
    api = createRuntimeApi()
    await api.listen()
  }
  return api
}
const startClient = async ({
  files = {},
  dir = write(tempDir(), files),
  handlerFile = 'handler.mjs',
  exportPath = 'handler',
  deployedRuntime = 'nodejs24.x',
  colors = false,
  env,
  loader,
}) => {
  const channel = (await startApi()).channel(workerId())
  const child = spawnTracked(
    process.execPath,
    clientArgs({
      dir,
      handlerFile,
      exportPath,
      deployedRuntime,
      colors,
      loader,
    }),
    { cwd: dir, env: lambdaEnv(channel, env) },
  )
  const invoke = async (options) =>
    collect(await channel.dispatch(invocation(options)))
  return { channel, child, dir, invoke }
}
const json = (reply) => JSON.parse(reply.text)

describe('the Node.js runtime client', () => {
  test('runs an ESM handler and returns its result as JSON', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          'export const handler = async (event) => ({ echo: event.value })\n',
      },
    })
    const reply = await invoke({ event: { value: 7 } })
    expect(reply.kind).toBe('response')
    expect(json(reply)).toEqual({ echo: 7 })
  })

  test('runs a CommonJS handler, and an undefined result is null', async () => {
    const { invoke } = await startClient({
      files: { 'handler.cjs': 'exports.handler = async () => undefined\n' },
      handlerFile: 'handler.cjs',
    })
    expect((await invoke()).text).toBe('null')
  })

  test('finds a nested export', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          'export const api = { main: async () => ({ nested: true }) }\n',
      },
      exportPath: 'api.main',
    })
    expect(json(await invoke())).toEqual({ nested: true })
  })

  test('passes the Lambda context: request id, ARN, deadline, function fields, identity, client context and tenant', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = async (event, context) => ({',
          '  awsRequestId: context.awsRequestId,',
          '  invokedFunctionArn: context.invokedFunctionArn,',
          '  functionName: context.functionName,',
          '  functionVersion: context.functionVersion,',
          '  memoryLimitInMB: context.memoryLimitInMB,',
          '  logGroupName: context.logGroupName,',
          '  logStreamName: context.logStreamName,',
          '  identity: context.identity,',
          '  clientContext: context.clientContext,',
          '  tenantId: context.tenantId,',
          '  remaining: context.getRemainingTimeInMillis(),',
          '  waits: context.callbackWaitsForEmptyEventLoop,',
          '})',
          '',
        ].join('\n'),
      },
    })
    const context = json(
      await invoke({
        requestId: 'req-ctx',
        deadlineMs: Date.now() + 20_000,
        headers: {
          'lambda-runtime-cognito-identity': '{"cognitoIdentityId":"id-1"}',
          'lambda-runtime-client-context': '{"custom":{"a":1}}',
          'lambda-runtime-aws-tenant-id': 'tenant-a',
        },
      }),
    )
    expect(context).toMatchObject({
      awsRequestId: 'req-ctx',
      invokedFunctionArn:
        'arn:aws:lambda:us-east-1:123456789012:function:svc-dev-api',
      functionName: 'svc-dev-api',
      functionVersion: '$LATEST',
      memoryLimitInMB: '1024',
      logGroupName: '/aws/lambda/svc-dev-api',
      logStreamName: '2026/10/01/[$LATEST]abc',
      identity: { cognitoIdentityId: 'id-1' },
      clientContext: { custom: { a: 1 } },
      tenantId: 'tenant-a',
      waits: true,
    })
    expect(context.remaining).toBeGreaterThan(10_000)
    expect(context.remaining).toBeLessThanOrEqual(20_000)
  })

  test('sets _X_AMZN_TRACE_ID per invocation and removes it when the invocation has none', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          'export const handler = async () => ({ trace: process.env._X_AMZN_TRACE_ID ?? null })\n',
      },
    })
    expect(
      json(
        await invoke({ headers: { 'lambda-runtime-trace-id': 'Root=1-abc' } }),
      ),
    ).toEqual({ trace: 'Root=1-abc' })
    expect(json(await invoke())).toEqual({ trace: null })
  })

  test('keeps module state between invocations of one process', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          'let n = 0\nexport const handler = async () => ({ n: (n += 1) })\n',
      },
    })
    expect(json(await invoke())).toEqual({ n: 1 })
    expect(json(await invoke())).toEqual({ n: 2 })
  })

  test("a thrown error becomes Lambda's error body, with this machine's paths shown as /var/task", async () => {
    const { invoke, dir } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = async () => {\n  throw new TypeError('bad input')\n}\n",
      },
    })
    const reply = await invoke()
    expect(reply).toMatchObject({ kind: 'error', errorType: 'TypeError' })
    const body = json(reply)
    expect(body.errorType).toBe('TypeError')
    expect(body.errorMessage).toBe('bad input')
    expect(body.trace[0]).toBe('TypeError: bad input')
    expect(
      body.trace.some((line) => line.includes('/var/task/handler.mjs:2:')),
    ).toBe(true)
    expect(body.trace.some((line) => line.includes(dir))).toBe(false)
    expect(body.trace.some((line) => line.includes('node-client.mjs'))).toBe(
      false,
    )
  })

  test('an event body that is not JSON fails the invocation with the parse error, as Lambda does; the handler is not entered', async () => {
    const { channel, invoke, child } = await startClient({
      files: {
        'handler.mjs':
          'export const handler = async (event) => ({ entered: true, event })\n',
      },
    })
    for (const body of ['', 'not json']) {
      const reply = await collect(
        await channel.dispatch({ ...invocation(), event: Buffer.from(body) }),
      )
      expect(reply).toMatchObject({ kind: 'error', errorType: 'SyntaxError' })
      expect(json(reply).errorMessage).toBe(
        (() => {
          try {
            JSON.parse(body)
          } catch (error) {
            return error.message
          }
        })(),
      )
    }
    expect(json(await invoke())).toEqual({ entered: true, event: {} })
    expect(child.exitCode).toBeNull()
  })

  test("an ES module's frames keep their file:// scheme, the way a deployed function shows them", async () => {
    // A deployed nodejs24.x function that throws in cases.mjs shows
    // "    at BufferedInvokeProcessor.throws [as handler] (file:///var/task/cases.mjs:3:9)".
    const { invoke } = await startClient({
      files: {
        'cases.mjs':
          "export const throws = async () => {\n  throw new Error('boom')\n}\n",
      },
      handlerFile: 'cases.mjs',
      exportPath: 'throws',
    })
    const { trace } = json(await invoke())
    expect(
      trace.some((line) => line.includes('(file:///var/task/cases.mjs:2:')),
    ).toBe(true)
    expect(trace.some((line) => line.includes('(/var/task/'))).toBe(false)
  })

  test('an error body names its invocation, after the trace, as a deployed function does', async () => {
    // A deployed nodejs24.x function that throws 'plain' answers
    // {"errorType":"string","errorMessage":"plain","trace":[],"requestId":"<its request id>"}.
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = async (event) => {\n  if (event.plain) throw 'plain'\n  throw new Error('boom')\n}\n",
      },
    })
    const plain = await invoke({
      requestId: 'ed97c045-6875-41d0-a31d-e559e9515258',
      event: { plain: true },
    })
    expect(plain.text).toBe(
      '{"errorType":"string","errorMessage":"plain","trace":[],"requestId":"ed97c045-6875-41d0-a31d-e559e9515258"}',
    )
    const thrown = json(
      await invoke({ requestId: 'af94d93f-0000-0000-0000-000000000000' }),
    )
    expect(Object.keys(thrown)).toEqual([
      'errorType',
      'errorMessage',
      'trace',
      'requestId',
    ])
    expect(thrown.requestId).toBe('af94d93f-0000-0000-0000-000000000000')
  })

  test('a thrown value that is not an Error is reported with its type', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = async () => {\n  throw 'boom'\n}\n",
      },
    })
    expect(json(await invoke())).toEqual({
      errorType: 'string',
      errorMessage: 'boom',
      trace: [],
      requestId: expect.any(String),
    })
  })

  test("a result that cannot be serialized is the runtime's Runtime.JSONStringifyError", async () => {
    // A deployed nodejs24.x function answering { big: 1n } gets
    // {"errorType":"Runtime.JSONStringifyError","errorMessage":"Unable to stringify response body",
    //  "trace":["Runtime.JSONStringifyError: Unable to stringify response body", <runtime frames>],
    //  "requestId":"<its request id>"}.
    const { invoke } = await startClient({
      files: {
        'handler.mjs': 'export const handler = async () => ({ big: 1n })\n',
      },
    })
    const reply = await invoke({
      requestId: '17a1a90f-a894-43c1-9270-ba74220c3e71',
    })
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.JSONStringifyError',
    })
    const body = json(reply)
    expect(body).toMatchObject({
      errorType: 'Runtime.JSONStringifyError',
      errorMessage: 'Unable to stringify response body',
      requestId: '17a1a90f-a894-43c1-9270-ba74220c3e71',
    })
    expect(body.trace[0]).toBe(
      'Runtime.JSONStringifyError: Unable to stringify response body',
    )
    expect(body.trace.join('\n')).not.toContain('node-client.mjs')
  })

  const callbackHandler = [
    'export const handler = (event, context, callback) => {',
    "  if (typeof callback !== 'function') throw new Error('no callback')",
    "  callback(null, { via: 'callback' })",
    '}',
    '',
  ].join('\n')

  test('gives handlers deployed on Node.js 22 a callback, and none from Node.js 24 on', async () => {
    const older = await startClient({
      files: { 'handler.mjs': callbackHandler },
      deployedRuntime: 'nodejs22.x',
    })
    expect(json(await older.invoke())).toEqual({ via: 'callback' })
    const newer = await startClient({
      files: { 'handler.mjs': callbackHandler },
      deployedRuntime: 'nodejs24.x',
    })
    const reply = await newer.invoke()
    expect(reply.kind).toBe('error')
    expect(json(reply).errorMessage).toBe('no callback')
  })

  test('a Node.js 22 callback answers once the event loop is empty, unless callbackWaitsForEmptyEventLoop is false', async () => {
    const TIMER_MS = 500
    const { invoke } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = (event, context, callback) => {',
          '  if (event.dontWait) context.callbackWaitsForEmptyEventLoop = false',
          `  setTimeout(() => {}, ${TIMER_MS})`,
          "  callback(null, 'called back')",
          '}',
          '',
        ].join('\n'),
      },
      deployedRuntime: 'nodejs22.x',
    })
    const timed = async (event) => {
      const started = performance.now()
      const reply = await invoke({ event })
      return { value: json(reply), ms: performance.now() - started }
    }
    const waited = await timed({})
    expect(waited.value).toBe('called back')
    // The timer the handler left keeps the event loop busy: the answer waits for it.
    expect(waited.ms).toBeGreaterThanOrEqual(TIMER_MS - 50)
    const atOnce = await timed({ dontWait: true })
    expect(atOnce.value).toBe('called back')
    expect(atOnce.ms).toBeLessThan(TIMER_MS - 50)
  })

  test('a Node.js 22 callback with an error answers at once, even with the event loop busy', async () => {
    const TIMER_MS = 500
    const { invoke } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = (event, context, callback) => {',
          `  setTimeout(() => {}, ${TIMER_MS})`,
          "  callback(new Error('upstream 503'))",
          '}',
          '',
        ].join('\n'),
      },
      deployedRuntime: 'nodejs22.x',
    })
    const started = performance.now()
    const reply = await invoke()
    const ms = performance.now() - started
    expect(reply.kind).toBe('error')
    expect(json(reply).errorMessage).toBe('upstream 503')
    expect(ms).toBeLessThan(TIMER_MS - 50)
  })

  test('a Node.js 22 callback with any error but null or undefined answers with that error, as Lambda does', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': [
          'const errors = { zero: 0, empty: "", no: false, none: null }',
          'export const handler = (event, context, callback) => {',
          '  context.callbackWaitsForEmptyEventLoop = false',
          '  callback(errors[event.error], "ok")',
          '}',
          '',
        ].join('\n'),
      },
      deployedRuntime: 'nodejs22.x',
    })
    const outcome = async (error) => {
      const reply = await invoke({ event: { error } })
      return reply.kind === 'error'
        ? { kind: 'error', errorType: json(reply).errorType }
        : { kind: reply.kind, value: json(reply) }
    }
    expect(await outcome('zero')).toEqual({
      kind: 'error',
      errorType: 'number',
    })
    expect(await outcome('empty')).toEqual({
      kind: 'error',
      errorType: 'string',
    })
    expect(await outcome('no')).toEqual({ kind: 'error', errorType: 'boolean' })
    expect(await outcome('none')).toEqual({ kind: 'response', value: 'ok' })
  })

  test('context.succeed and context.fail work for handlers deployed on Node.js 22', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = (event, context) => {',
          "  if (event.fail) context.fail(new Error('failed'))",
          "  else context.succeed({ via: 'succeed' })",
          '}',
          '',
        ].join('\n'),
      },
      deployedRuntime: 'nodejs22.x',
    })
    expect(json(await invoke())).toEqual({ via: 'succeed' })
    expect(json(await invoke({ event: { fail: true } })).errorMessage).toBe(
      'failed',
    )
  })

  test.each([
    [
      'a missing module',
      { 'other.mjs': '' },
      'missing.mjs',
      'handler',
      'Runtime.ImportModuleError',
    ],
    [
      'a missing export',
      { 'handler.mjs': 'export const other = 1\n' },
      'handler.mjs',
      'handler',
      'Runtime.HandlerNotFound',
    ],
    [
      'a syntax error',
      { 'handler.mjs': 'export const handler = (\n' },
      'handler.mjs',
      'handler',
      'Runtime.UserCodeSyntaxError',
    ],
    [
      'an error while importing',
      { 'handler.mjs': "throw new RangeError('init failed')\n" },
      'handler.mjs',
      'handler',
      'RangeError',
    ],
  ])(
    'reports %s as an init error and exits',
    async (name, files, handlerFile, exportPath, errorType) => {
      const { invoke, child } = await startClient({
        files,
        handlerFile,
        exportPath,
      })
      const reply = await invoke()
      expect(reply).toMatchObject({ kind: 'init_error', errorType })
      expect(json(reply).errorType).toBe(errorType)
      expect((await child.exited).code).toBe(1)
    },
  )

  test('an uncaught exception fails the invocation in flight and ends the process', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = () => new Promise(() => { setTimeout(() => { throw new Error('later') }, 10) })\n",
      },
    })
    const reply = await invoke({
      requestId: 'crash-0000-0000-0000-000000000001',
    })
    expect(reply.kind).toBe('error')
    expect(json(reply).errorMessage).toBe('later')
    // Like every invocation error the runtime posts, it names its invocation.
    expect(json(reply).requestId).toBe('crash-0000-0000-0000-000000000001')
    expect((await child.exited).code).toBe(129)
  })

  test('an unhandled rejection fails the invocation in flight and exits 128', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = async () => {',
          "  Promise.reject(new Error('boom'))",
          '  await new Promise((resolve) => setTimeout(resolve, 5_000))',
          '}',
          '',
        ].join('\n'),
      },
    })
    const reply = await invoke()
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.UnhandledPromiseRejection',
    })
    expect(json(reply).errorMessage).toBe('Error: boom')
    expect((await child.exited).code).toBe(128)
  })

  const NODE_JS_EXIT = {
    errorType: 'Runtime.NodeJsExit',
    errorMessage:
      'The Lambda runtime client detected an unexpected Node.js exit code. This is most commonly caused by a Promise that was never settled. For more information, see https://nodejs.org/docs/latest/api/process.html#exit-codes',
  }

  test('a Node.js 22 handler that never calls back answers null, and the process serves on', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs': [
          'export const handler = (event, context, callback) => {',
          "  if (event.ok) callback(null, 'called back')",
          '}',
          '',
        ].join('\n'),
      },
      deployedRuntime: 'nodejs22.x',
    })
    const reply = await invoke()
    expect(reply.kind).toBe('response')
    expect(reply.text).toBe('null')
    expect(json(await invoke({ event: { ok: true } }))).toBe('called back')
    expect(child.exitCode).toBeNull()
  })

  test('a promise that never settles is a Runtime.NodeJsExit error, and the process serves on', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = async (event) => (event.ok ? 'settled' : new Promise(() => {}))\n",
      },
    })
    const reply = await invoke()
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.NodeJsExit',
    })
    expect(json(reply)).toMatchObject(NODE_JS_EXIT)
    expect(json(await invoke({ event: { ok: true } }))).toBe('settled')
    expect(child.exitCode).toBeNull()
  })

  const streamingHandler = (body) =>
    [
      'export const handler = awslambda.streamifyResponse(async (event, responseStream) => {',
      body,
      '})',
      '',
    ].join('\n')
  const prelude = (buffer) => {
    const delimiter = buffer.indexOf(Buffer.alloc(8))
    return {
      metadata: JSON.parse(buffer.subarray(0, delimiter).toString('utf8')),
      rest: buffer.subarray(delimiter + 8).toString('utf8'),
    }
  }
  const trailerError = (trailers) =>
    JSON.parse(Buffer.from(trailers.errorBody, 'base64').toString('utf8'))

  test('streams with awslambda.streamifyResponse: the prelude, then every write as it happens', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  const stream = awslambda.HttpResponseStream.from(responseStream, { statusCode: 201, headers: { 'x-a': 'b' } })",
            "  stream.write('one')",
            '  await new Promise((resolve) => setTimeout(resolve, 400))',
            "  stream.write('two')",
            '  stream.end()',
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(reply.contentType).toBe(
      'application/vnd.awslambda.http-integration-response',
    )
    expect(prelude(reply.buffer)).toEqual({
      metadata: { statusCode: 201, headers: { 'x-a': 'b' } },
      rest: 'onetwo',
    })
    expect(reply.at[reply.at.length - 1] - reply.at[0]).toBeGreaterThanOrEqual(
      300,
    )
    expect(reply.trailers).toEqual({ errorType: null, errorBody: null })
  })

  test('an error before the first write sends no prelude, only trailers', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            '  awslambda.HttpResponseStream.from(responseStream, { statusCode: 200 })',
            "  throw new Error('before any write')",
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(reply.buffer.length).toBe(0)
    expect(reply.trailers.errorType).toBe('Error')
    expect(trailerError(reply.trailers).errorMessage).toBe('before any write')
  })

  test('an error mid-stream ends the stream with error trailers', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  responseStream.write('partial')",
            "  throw new Error('mid-stream')",
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    expect(reply.kind).toBe('stream')
    expect(reply.text).toBe('partial')
    expect(reply.trailers.errorType).toBe('Error')
    expect(trailerError(reply.trailers).errorMessage).toBe('mid-stream')
  })

  test('an error right after several writes keeps every write, and the process serves on', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  if (event.ok) return responseStream.end('fine')",
            "  responseStream.write('a')",
            "  responseStream.write('b')",
            "  responseStream.write('c')",
            "  throw new Error('after writes')",
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    expect(reply.text).toBe('abc')
    expect(trailerError(reply.trailers).errorMessage).toBe('after writes')
    expect((await invoke({ event: { ok: true } })).text).toBe('fine')
    expect(child.exitCode).toBeNull()
  })

  test('an error after the stream ended is logged the way Lambda logs it, and the process serves on', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  if (event.ok) return responseStream.end('fine')",
            "  responseStream.end('done')",
            '  await new Promise((resolve) => setTimeout(resolve, 50))',
            "  throw new TypeError('after end')",
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    // The caller already has the whole response: no trailers can follow it.
    expect(reply.text).toBe('done')
    expect(reply.trailers.errorType).toBeNull()
    expect(await waitFor(() => child.stderrText.includes('Invoke Error'))).toBe(
      true,
    )
    const line = child.stderrText
      .split('\n')
      .find((text) => text.startsWith('Invoke Error '))
    const logged = JSON.parse(line.slice('Invoke Error '.length))
    expect(logged).toMatchObject({
      errorType: 'TypeError',
      errorMessage: 'after end',
    })
    expect(logged.stack[0]).toBe('TypeError: after end')
    expect(logged.stack.join('\n')).toContain('/var/task/handler.mjs')
    expect((await invoke({ event: { ok: true } })).text).toBe('fine')
    expect(child.exitCode).toBeNull()
  })

  // Once a write has opened the response, the open connection keeps the event loop busy, as it
  // does in Lambda, and the invocation runs until its timeout.
  test('a streaming handler that never settles before writing ends with Runtime.NodeJsExit, and the process serves on', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  if (event.ok) return responseStream.end('fine')",
            '  await new Promise(() => {})',
          ].join('\n'),
        ),
      },
    })
    const reply = await invoke()
    expect(reply.text).toBe('')
    expect(reply.trailers.errorType).toBe('Runtime.NodeJsExit')
    expect(trailerError(reply.trailers)).toMatchObject(NODE_JS_EXIT)
    expect((await invoke({ event: { ok: true } })).text).toBe('fine')
    expect(child.exitCode).toBeNull()
  })

  test('a streaming handler gets no event body that is not JSON: the stream fails with the parse error', async () => {
    const { channel, invoke } = await startClient({
      files: {
        'handler.mjs': streamingHandler("  responseStream.end('entered')"),
      },
    })
    const reply = await collect(
      await channel.dispatch({
        ...invocation(),
        event: Buffer.from('not json'),
      }),
    )
    expect(reply.text).toBe('')
    expect(reply.trailers.errorType).toBe('SyntaxError')
    expect((await invoke()).text).toBe('entered')
  })

  test.each([
    ['nodejs24.x', 'Error'],
    ['nodejs22.x', 'string'],
  ])(
    'a streaming handler that is not async fails the stream, as Lambda does on %s',
    async (deployedRuntime, errorType) => {
      const { invoke, child } = await startClient({
        deployedRuntime,
        files: {
          'handler.mjs': [
            'export const handler = awslambda.streamifyResponse((event, responseStream) => {',
            "  responseStream.end('sync')",
            '})',
            '',
          ].join('\n'),
        },
      })
      const reply = await invoke()
      expect(reply.trailers.errorType).toBe(errorType)
      expect(trailerError(reply.trailers).errorMessage).toBe(
        'Streaming does not support non-async handlers.',
      )
      expect(child.exitCode).toBeNull()
    },
  )

  test("setContentType after the first write throws the runtime's error", async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs': streamingHandler(
          [
            "  responseStream.write('a')",
            "  try { responseStream.setContentType('text/plain') } catch (error) { responseStream.write(` ${error.message}`) }",
            '  responseStream.end()',
          ].join('\n'),
        ),
      },
    })
    expect((await invoke()).text).toBe('a Cannot set content-type, too late.')
  })

  test('AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA leaves awslambda undefined', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.mjs':
          'export const handler = async () => ({ type: typeof globalThis.awslambda })\n',
      },
      env: { AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA: '1' },
    })
    expect(json(await invoke())).toEqual({ type: 'undefined' })
  })

  test('formats logged objects in full, with colours only when asked', async () => {
    const files = {
      'handler.mjs':
        'export const handler = async () => { console.log({ a: { b: { c: { d: 1 } } } }); return 1 }\n',
    }
    // The child's stdout and the HTTP reply travel separately: wait for the line to arrive.
    const plain = await startClient({ files })
    await plain.invoke()
    expect(await waitFor(() => plain.child.stdoutText.includes('d: 1'))).toBe(
      true,
    )
    expect(plain.child.stdoutText).not.toContain('\u001b[')
    const coloured = await startClient({ files, colors: true })
    await coloured.invoke()
    expect(
      await waitFor(() => coloured.child.stdoutText.includes('\u001b[')),
    ).toBe(true)
  })

  test('prints a logged object as it is, even when its text looks like a format string', async () => {
    const { invoke, child } = await startClient({
      files: {
        'handler.mjs':
          "export const handler = async () => { console.log({ a: '%s' }, 'x'); return 1 }\n",
      },
    })
    await invoke()
    expect(await waitFor(() => child.stdoutText.includes('\n'))).toBe(true)
    expect(child.stdoutText).toBe("{ a: '%s' } x\n")
  })

  test('names the missing handler the way Lambda does, by its full handler string', async () => {
    const missing = await startClient({
      files: { 'src/handler.mjs': 'export const other = 1\n' },
      handlerFile: path.join('src', 'handler.mjs'),
      exportPath: 'main',
    })
    expect(json(await missing.invoke()).errorMessage).toBe(
      'src/handler.main is undefined or not exported',
    )
    const notCallable = await startClient({
      files: { 'src/handler.mjs': 'export const main = 1\n' },
      handlerFile: path.join('src', 'handler.mjs'),
      exportPath: 'main',
    })
    expect(json(await notCallable.invoke())).toMatchObject({
      errorType: 'Runtime.HandlerNotFound',
      errorMessage: 'src/handler.main is not a function',
    })
  })

  test('a handler without a dot is a malformed handler name, as a deployed function reports it', async () => {
    // A deployed nodejs24.x function with handler "nodot" answers
    // {"errorType":"Runtime.MalformedHandlerName","errorMessage":"Bad handler","trace":[…]}.
    const { invoke } = await startClient({
      files: { 'nodot.mjs': 'export const handler = async () => 1\n' },
      handlerFile: 'nodot.mjs',
      exportPath: null,
    })
    const reply = await invoke()
    expect(reply.kind).toBe('init_error')
    expect(json(reply)).toEqual({
      errorType: 'Runtime.MalformedHandlerName',
      errorMessage: 'Bad handler',
      trace: ['Runtime.MalformedHandlerName: Bad handler'],
    })
  })

  test("a syntax error's trace is the SyntaxError's own, as a deployed function reports it", async () => {
    // A deployed nodejs24.x function whose module is cut short answers
    // {"errorType":"Runtime.UserCodeSyntaxError","errorMessage":"SyntaxError: Unexpected end of input",
    //  "trace":["SyntaxError: Unexpected end of input","    at compileSourceTextModule (node:internal/…)",…]}.
    const { invoke } = await startClient({
      files: { 'syntax.mjs': 'export const handler = async () => {\n' },
      handlerFile: 'syntax.mjs',
    })
    const body = json(await invoke())
    expect(body.errorType).toBe('Runtime.UserCodeSyntaxError')
    expect(body.errorMessage).toBe('SyntaxError: Unexpected end of input')
    expect(body.trace[0]).toBe('SyntaxError: Unexpected end of input')
    expect(body).not.toHaveProperty('requestId')
  })

  test("an init error's message shows /var/task and Lambda's runtime path, not this machine's", async () => {
    const { invoke, dir } = await startClient({
      files: { 'other.mjs': '' },
      handlerFile: 'missing.mjs',
    })
    const body = json(await invoke())
    expect(body.errorType).toBe('Runtime.ImportModuleError')
    expect(body.errorMessage).toContain("'/var/task/missing.mjs'")
    expect(body.errorMessage).toContain('/var/runtime/index.mjs')
    const shown = [body.errorMessage, ...body.trace].join('\n')
    expect(shown).not.toContain(dir)
    expect(shown).not.toContain('node-client.mjs')
    expect(body.trace[0]).toBe(
      `Runtime.ImportModuleError: ${body.errorMessage}`,
    )
  })

  test('rewrites the code root only where a path starts, in the message and the trace', async () => {
    const dir = tempDir()
    write(dir, {
      'handler.mjs': `export const handler = async () => {\n  throw new Error(${JSON.stringify(`copy /backup${dir}/a.txt of ${dir}/a.txt`)})\n}\n`,
    })
    const { invoke } = await startClient({ dir })
    const body = json(await invoke())
    expect(body.errorMessage).toBe(
      `copy /backup${dir}/a.txt of /var/task/a.txt`,
    )
    expect(body.trace[0]).toBe(`Error: ${body.errorMessage}`)
    expect(
      body.trace.some((line) => line.includes('/var/task/handler.mjs:2:')),
    ).toBe(true)
  })

  test('shows a code root reached through a symbolic link as /var/task', async () => {
    const real = write(tempDir(), {
      'handler.mjs':
        "export const handler = async () => {\n  throw new Error('linked')\n}\n",
    })
    const link = path.join(tempDir(), 'linked-project')
    symlinkSync(real, link, 'junction')
    const { invoke } = await startClient({ dir: link })
    const body = json(await invoke())
    expect(
      body.trace.some((line) => line.includes('/var/task/handler.mjs:2:')),
    ).toBe(true)
    const shown = body.trace.join('\n')
    expect(shown).not.toContain(real)
    expect(shown).not.toContain(link)
    expect(shown).not.toContain('/private/var/task')
  })

  test('runs a TypeScript handler with enums through the tsx loader', async () => {
    const { invoke } = await startClient({
      files: {
        'handler.ts':
          "enum Shape { Circle = 'circle' }\nexport const handler = async (): Promise<object> => ({ shape: Shape.Circle })\n",
      },
      handlerFile: 'handler.ts',
      loader: tsxLoaderUrl(),
    })
    expect(json(await invoke())).toEqual({ shape: 'circle' })
  })

  test('exits when the Runtime API goes away', async () => {
    const { invoke, child } = await startClient({
      files: { 'handler.mjs': 'export const handler = async () => 1\n' },
    })
    await invoke()
    await api.close()
    api = null
    expect(await exitWithin(child, 10_000)).toEqual({ code: 0, signal: null })
  })

  test('exits when the Runtime API goes away while its handler never settles', async () => {
    const { channel, child, dir } = await startClient({
      files: {
        // Keeps the event loop busy, so nothing but a liveness check can notice the CLI is gone.
        'handler.mjs': [
          "import { writeFileSync } from 'node:fs'",
          'export const handler = () => {',
          "  writeFileSync('started', '1')",
          '  return new Promise(() => setInterval(() => {}, 1000))',
          '}',
          '',
        ].join('\n'),
      },
    })
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    await api.close()
    api = null
    // Two refused connects 2 s apart; on Windows a refused connect itself takes a while to report.
    expect(await exitWithin(child, 15_000)).toEqual({ code: 0, signal: null })
  })

  test('keeps running while the CLI is too busy to answer', async () => {
    const { channel, child, dir } = await startClient({
      files: {
        'handler.mjs': [
          "import { writeFileSync } from 'node:fs'",
          'export const handler = () => {',
          "  writeFileSync('started', '1')",
          '  return new Promise(() => setInterval(() => {}, 1000))',
          '}',
          '',
        ].join('\n'),
      },
    })
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    // The Runtime API runs in this process: blocking it for longer than two checks leaves the
    // listener open and unanswered, the way a CLI under load is.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000)
    expect(await exitWithin(child, 3_000)).toBe('still running')
  })

  test('keeps running while every connect to the CLI times out: a timeout is never gone', async () => {
    const channel = (await startApi()).channel(workerId())
    const dir = write(tempDir(), {
      // Keeps the event loop busy, so only the liveness check runs.
      'handler.mjs': [
        "import { writeFileSync } from 'node:fs'",
        'export const handler = () => {',
        "  writeFileSync('started', '1')",
        '  return new Promise(() => setInterval(() => {}, 1000))',
        '}',
        '',
      ].join('\n'),
    })
    // Whether a connect to a busy listener times out depends on the operating system (a full
    // accept queue can refuse or accept it instead), so this hook makes the client's liveness
    // connect hang: once the handler has started, it neither connects nor fails, and the client's
    // own timeout ends it. The Runtime API calls are real.
    const hook = path.join(
      write(tempDir(), {
        'stall-liveness.mjs': [
          "import { appendFileSync, existsSync } from 'node:fs'",
          "import net from 'node:net'",
          'const connect = net.connect',
          'net.connect = function (...args) {',
          "  if (!existsSync('started')) return connect.apply(this, args)",
          "  appendFileSync('stalled', '1')",
          '  return new net.Socket()',
          '}',
          '',
        ].join('\n'),
      }),
      'stall-liveness.mjs',
    )
    const child = spawnTracked(
      process.execPath,
      clientArgs({
        dir,
        handlerFile: 'handler.mjs',
        exportPath: 'handler',
        deployedRuntime: 'nodejs24.x',
        colors: false,
        loader: pathToFileURL(hook).href,
      }),
      { cwd: dir, env: lambdaEnv(channel) },
    )
    channel.dispatch(invocation()).catch(() => {})
    expect(
      await waitFor(() => existsSync(path.join(dir, 'started')), 10_000),
    ).toBe(true)
    // A check every 2 s, each a connect that times out (after 1 s, 3 s on Windows): two refused in
    // a row would have ended it.
    expect(await exitWithin(child, 8_000)).toBe('still running')
    expect(
      readFileSync(path.join(dir, 'stalled'), 'utf8').length,
    ).toBeGreaterThanOrEqual(2)
  })

  const posixOnly = process.platform === 'win32' ? test.skip : test

  posixOnly('exits when its parent process is gone', async () => {
    const channel = (await startApi()).channel(workerId())
    const dir = write(tempDir(), {
      'handler.mjs': 'export const handler = async () => 1\n',
    })
    const pid = await startWithShortLivedParent({
      command: process.execPath,
      args: clientArgs({
        dir,
        handlerFile: 'handler.mjs',
        exportPath: 'handler',
        deployedRuntime: 'nodejs24.x',
        colors: false,
        parentPid: PARENT_PID,
      }),
      cwd: dir,
      env: lambdaEnv(channel),
    })
    try {
      expect(await waitFor(() => !alive(pid), 6_000)).toBe(true)
    } finally {
      killPid(pid)
    }
  })

  posixOnly(
    'exits when the CLI that started it was gone before it started',
    async () => {
      const gone = spawnTracked(process.execPath, ['-e', ''], {
        cwd: tempDir(),
        env: baseEnv(),
      })
      await gone.exited
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.mjs': 'export const handler = async () => 1\n',
      })
      const child = spawnTracked(
        process.execPath,
        clientArgs({
          dir,
          handlerFile: 'handler.mjs',
          exportPath: 'handler',
          deployedRuntime: 'nodejs24.x',
          colors: false,
          parentPid: gone.pid,
        }),
        { cwd: dir, env: lambdaEnv(channel) },
      )
      expect(await exitWithin(child, 10_000)).toEqual({
        code: 0,
        signal: null,
      })
    },
  )

  posixOnly(
    'started through a wrapper, serves while the CLI runs and exits once it is gone',
    async () => {
      // The CLI stand-in is not this client's parent, the way a launcher that does not exec sits
      // between the two.
      const cli = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.mjs': 'export const handler = async () => 1\n',
      })
      const child = spawnTracked(
        process.execPath,
        clientArgs({
          dir,
          handlerFile: 'handler.mjs',
          exportPath: 'handler',
          deployedRuntime: 'nodejs24.x',
          colors: false,
          parentPid: cli.pid,
        }),
        { cwd: dir, env: lambdaEnv(channel) },
      )
      expect((await collect(await channel.dispatch(invocation()))).text).toBe(
        '1',
      )
      // Parent checks keep passing while the CLI is alive.
      expect(await exitWithin(child, 2_500)).toBe('still running')
      cli.kill('SIGKILL')
      expect(await exitWithin(child, 10_000)).toEqual({
        code: 0,
        signal: null,
      })
    },
  )

  posixOnly(
    'a client whose CLI is gone kills the processes its handler started, and nothing outside its group',
    async () => {
      const cli = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      // In the test's own process group, the way the CLI and its terminal are.
      const bystander = spawnTracked(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 60_000)'],
        { cwd: tempDir(), env: baseEnv() },
      )
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.mjs': [
          "import { spawn } from 'node:child_process'",
          "import { writeFileSync } from 'node:fs'",
          'export const handler = async () => {',
          "  const sidecar = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
          "  writeFileSync('sidecar.pid', String(sidecar.pid))",
          '  return 1',
          '}',
          '',
        ].join('\n'),
      })
      const client = spawn(
        process.execPath,
        clientArgs({
          dir,
          handlerFile: 'handler.mjs',
          exportPath: 'handler',
          deployedRuntime: 'nodejs24.x',
          colors: false,
          parentPid: cli.pid,
          ownGroup: true,
        }),
        { cwd: dir, env: lambdaEnv(channel), detached: true, stdio: 'ignore' },
      )
      try {
        expect((await collect(await channel.dispatch(invocation()))).text).toBe(
          '1',
        )
        const sidecar = Number(
          readFileSync(path.join(dir, 'sidecar.pid'), 'utf8'),
        )
        expect(alive(sidecar)).toBe(true)
        cli.kill('SIGKILL')
        expect(
          await waitFor(() => !alive(client.pid) && !alive(sidecar), 8_000),
        ).toBe(true)
        expect(alive(bystander.pid)).toBe(true)
      } finally {
        try {
          process.kill(-client.pid, 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    },
  )

  posixOnly(
    'a client that does not lead a process group of its own exits alone, leaving its group',
    async () => {
      const channel = (await startApi()).channel(workerId())
      const dir = write(tempDir(), {
        'handler.mjs': 'export const handler = async () => 1\n',
      })
      const args = clientArgs({
        dir,
        handlerFile: 'handler.mjs',
        exportPath: 'handler',
        deployedRuntime: 'nodejs24.x',
        colors: false,
        ownGroup: true,
      })
      // The CLI stand-in leads a process group and starts the client inside it, not as a leader.
      const cli = spawn(
        process.execPath,
        [
          '-e',
          [
            "const { spawn } = require('child_process')",
            `const child = spawn(process.execPath, ${JSON.stringify(args)}, { cwd: ${JSON.stringify(dir)}, env: ${JSON.stringify(lambdaEnv(channel))}, stdio: 'ignore' })`,
            'console.log(child.pid)',
            'setTimeout(() => {}, 60_000)',
          ].join('\n'),
        ],
        {
          cwd: dir,
          env: baseEnv(),
          detached: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      let printed = ''
      cli.stdout.on('data', (chunk) => {
        printed += chunk
      })
      try {
        expect(await waitFor(() => /^\d+\r?\n/.test(printed), 10_000)).toBe(
          true,
        )
        const clientPid = Number(printed.trim())
        expect((await collect(await channel.dispatch(invocation()))).text).toBe(
          '1',
        )
        await api.close()
        api = null
        expect(await waitFor(() => !alive(clientPid), 10_000)).toBe(true)
        expect(alive(cli.pid)).toBe(true)
      } finally {
        try {
          process.kill(-cli.pid, 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    },
  )

  describe('an MCP server through the prebuilt entry', () => {
    // The entry bundle is a build product; build it only when a developer or CI leg has not.
    beforeAll(async () => {
      if (!existsSync(mcpEntrySourcePath)) await buildMcpEntry()
    }, 120_000)

    test('answers through the streaming door with the HTTP prelude', async () => {
      const { invoke } = await startClient({
        dir: fixturesDir,
        handlerFile: mcpEntrySourcePath,
        exportPath: 'handler',
        env: {
          SERVERLESS_MCP_SERVER_MODULE: 'mcp-server.mjs',
          LAMBDA_TASK_ROOT: fixturesDir,
        },
      })
      const reply = await invoke({
        event: {
          httpMethod: 'POST',
          path: '/x/mcp',
          headers: { 'content-type': 'application/json' },
          requestContext: {
            httpMethod: 'POST',
            domainName: 'localhost',
            path: '/x/mcp',
            stage: 'dev',
          },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
          isBase64Encoded: false,
        },
      })
      expect(reply.kind).toBe('stream')
      const { metadata, rest } = prelude(reply.buffer)
      expect(metadata.statusCode).toBe(200)
      expect(rest).toContain('"ok":true')
    })
  })
})
