import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { eventBytesOf } from '../../../../../../../lib/plugins/aws/dev/local/replay.js'
import {
  BODY_INLINE_BYTES,
  INVOCATION_BYTES_PER_SERVICE,
  INVOCATION_FILES_PER_FUNCTION,
  REPLAY_BYTES,
  REPLAY_EVENTS_PER_FUNCTION,
  createInvocationRecorder,
} from '../../../../../../../lib/plugins/aws/dev/state/invocations.js'
import { errorReply } from '../../../../../../../lib/plugins/aws/dev/local/replies.js'

const SECRET = 'sk-test-0123456789'
const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const devDir = (dir) => path.join(dir, '.serverless', 'dev')
const allText = (dir) => {
  const texts = []
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name)
      if (entry.isDirectory()) walk(file)
      else texts.push(fs.readFileSync(file, 'utf8'))
    }
  }
  walk(dir)
  return texts.join('\n')
}
const clock = (start = Date.parse('2026-10-05T10:41:07.512Z')) => {
  let t = start
  const now = () => t
  now.advance = (ms) => {
    t += ms
  }
  return now
}
const recorder = ({ dir, limits, now = clock() } = {}) => {
  const records = []
  const rec = createInvocationRecorder({
    dir: devDir(dir),
    now,
    events: { emit: (type, fields) => records.push({ type, ...fields }) },
    limits,
    stage: 'alice',
    functions: new Map([
      ['createOrder', { name: 'orders-dev-createOrder', memoryMb: 1024 }],
    ]),
  })
  return { rec, records, now }
}
const httpApiEvent = {
  version: '2.0',
  routeKey: 'POST /orders',
  rawPath: '/orders',
  headers: {
    authorization: `Bearer ${SECRET}`,
    'content-type': 'application/json',
  },
  cookies: [`session=${SECRET}`],
  requestContext: {
    http: { method: 'POST', path: '/orders' },
    domainName: 'abc.execute-api.us-east-1.amazonaws.com',
  },
  body: '{"item":"tea"}',
}
const bytesOf = (value) => Buffer.from(JSON.stringify(value))
const run = (
  rec,
  {
    requestId = '3f2a9c1e-0000-4000-8000-000000000001',
    functionKey = 'createOrder',
    event = httpApiEvent,
    reply,
    logs = [],
    extraEnd = {},
    now,
    source = 'caller',
  } = {},
) => {
  const eventBytes = bytesOf(event)
  rec.start({
    functionKey,
    requestId,
    event,
    newWorker: true,
    eventBytes,
    environmentId: 'env-1',
    headers: { 'lambda-runtime-aws-request-id': requestId },
    source,
    // Never passed by the runtime; written nowhere even if it were.
    environment: { AWS_SECRET_ACCESS_KEY: SECRET },
  })
  for (const text of logs) rec.log({ requestId, text })
  now?.advance(38)
  rec.end({
    functionKey,
    requestId,
    event,
    eventBytes,
    reply,
    durationMs: 38,
    initMs: 80,
    deadlineMs: 1_759_661_073_512,
    endedAt: 0,
    timeoutSeconds: 6,
    environment: { AWS_SECRET_ACCESS_KEY: SECRET },
    source,
    ...extraEnd,
  })
}
const fileOf = (dir, record) =>
  JSON.parse(fs.readFileSync(path.join(dir, ...record.file.split('/')), 'utf8'))

describe('the invocation file', () => {
  test('an error from an HTTP API caller: outcome, status, what the caller received, the error, logs and context', () => {
    const dir = serviceDir()
    const { rec, records, now } = recorder({ dir })
    run(rec, {
      now,
      logs: ['creating order', 'about to fail'],
      reply: errorReply(
        'TypeError',
        "Cannot read properties of undefined (reading 'id')",
      ),
    })
    const end = records.find((record) => record.type === 'invocation.end')
    expect(records[0]).toEqual({
      type: 'invocation.start',
      function: 'createOrder',
      request_id: '3f2a9c1e-0000-4000-8000-000000000001',
      label: 'aws:apigateway:v2:post:/orders',
      new_worker: true,
      source: 'caller',
    })
    expect(end).toEqual({
      type: 'invocation.end',
      function: 'createOrder',
      request_id: '3f2a9c1e-0000-4000-8000-000000000001',
      source: 'caller',
      outcome: 'error',
      status_code: 500,
      error_type: 'TypeError',
      duration_ms: 38,
      file: '.serverless/dev/invocations/createOrder/1791196867-3f2a9c1e-0000-4000-8000-000000000001.json',
    })
    const file = fileOf(dir, end)
    expect(file).toMatchObject({
      v: 1,
      request_id: '3f2a9c1e-0000-4000-8000-000000000001',
      function: 'createOrder',
      stage: 'alice',
      source: 'caller',
      started_at: '2026-10-05T10:41:07.512Z',
      duration_ms: 38,
      init_ms: 80,
      deployed_timeout_s: 6,
      outcome: 'error',
      status_code: 500,
      caller_received: '500 Internal Server Error (API Gateway HTTP API)',
      error: {
        type: 'TypeError',
        message: "Cannot read properties of undefined (reading 'id')",
        stack: [],
      },
      logs: { lines: ['creating order', 'about to fail'], truncated: false },
      event_encoding: 'json',
      event_truncated: false,
      event_bytes: bytesOf(httpApiEvent).length,
      response: null,
      response_truncated: false,
      response_bytes: 0,
      context: {
        function_name: 'orders-dev-createOrder',
        memory_mb: 1024,
        deadline_ms: 1_759_661_073_512,
      },
      redacted: ['event.headers.authorization', 'event.cookies'],
    })
    expect(file.event.body).toBe('{"item":"tea"}')
    expect(Object.keys(file)).toEqual([
      'v',
      'request_id',
      'function',
      'stage',
      'source',
      'label',
      'started_at',
      'duration_ms',
      'init_ms',
      'deployed_timeout_s',
      'outcome',
      'status_code',
      'caller_received',
      'error',
      'logs',
      'event',
      'event_encoding',
      'event_truncated',
      'event_bytes',
      'response',
      'response_truncated',
      'response_bytes',
      'context',
      'redacted',
    ])
    expect(rec.counts()).toEqual({ total: 1, errors: 1 })
    expect(rec.lastInvocation()).toEqual({
      request_id: '3f2a9c1e-0000-4000-8000-000000000001',
      function: 'createOrder',
      outcome: 'error',
      ts: '2026-10-05T10:41:07.550Z',
    })
  })

  test('an event whose bytes are not text is kept in base64, and the file says so outside the event', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    const eventBytes = Buffer.from([0xff, 0xfe, 0x01])
    rec.start({ functionKey: 'createOrder', requestId: 'req-bin', eventBytes })
    rec.end({
      functionKey: 'createOrder',
      requestId: 'req-bin',
      eventBytes,
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    const file = fileOf(dir, records[1])
    expect(file.event).toEqual({ base64: eventBytes.toString('base64') })
    expect(file.event_encoding).toBe('base64')
  })

  test('an event that is text but not JSON is kept as its exact bytes, so a replay sends the same bytes', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    const eventBytes = Buffer.from('hello')
    rec.start({ functionKey: 'createOrder', requestId: 'req-text', eventBytes })
    rec.end({
      functionKey: 'createOrder',
      requestId: 'req-text',
      eventBytes,
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    const file = fileOf(dir, records[1])
    expect(file.event).toEqual({ base64: eventBytes.toString('base64') })
    expect(file.event_encoding).toBe('base64')
    // Once the session no longer holds the raw event, the replay reads the file.
    expect(eventBytesOf(file)).toEqual(eventBytes)
  })

  test('a JSON event shaped like the binary wrapper is recorded as JSON', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    const event = { base64: 'AQI=' }
    run(rec, { event, reply: { kind: 'response', body: Buffer.from('{}') } })
    const file = fileOf(dir, records[1])
    expect(file.event).toEqual(event)
    expect(file.event_encoding).toBe('json')
  })

  test('headers are redacted everywhere they appear', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    run(rec, {
      reply: {
        kind: 'response',
        body: bytesOf({
          statusCode: 201,
          headers: { 'Set-Cookie': `id=${SECRET}` },
          cookies: [`a=${SECRET}`],
          body: 'created',
        }),
      },
    })
    run(rec, {
      requestId: '3f2a9c1e-0000-4000-8000-000000000002',
      event: {
        httpMethod: 'GET',
        headers: { 'X-API-Key': SECRET },
        multiValueHeaders: { 'X-API-Key': [SECRET] },
        requestContext: { identity: { apiKey: SECRET } },
      },
      reply: {
        kind: 'response',
        body: bytesOf({
          statusCode: 200,
          multiValueHeaders: { 'set-cookie': [SECRET] },
        }),
      },
    })
    expect(allText(devDir(dir))).not.toContain(SECRET)
    expect(JSON.stringify(records)).not.toContain(SECRET)
    const first = fileOf(dir, records[1])
    expect(first).toMatchObject({
      outcome: 'ok',
      status_code: 201,
      caller_received: null,
      error: null,
    })
    expect(first.redacted).toEqual([
      'event.headers.authorization',
      'event.cookies',
      'response.headers.Set-Cookie',
      'response.cookies',
    ])
    expect(fileOf(dir, records[3]).redacted).toEqual([
      'event.headers.X-API-Key',
      'event.multiValueHeaders.X-API-Key',
      'event.requestContext.identity.apiKey',
      'response.multiValueHeaders.set-cookie',
    ])
  })

  test('the environment and credentials are never written', () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir })
    run(rec, {
      event: { detail: 'plain' },
      reply: { kind: 'response', body: Buffer.from('null') },
    })
    expect(allText(devDir(dir))).not.toContain(SECRET)
    expect(allText(devDir(dir))).not.toContain('AWS_SECRET_ACCESS_KEY')
  })

  if (process.platform !== 'win32') {
    test('the file is readable by its owner only', () => {
      const dir = serviceDir()
      const { rec, records } = recorder({ dir })
      run(rec, { reply: { kind: 'response', body: Buffer.from('{}') } })
      const file = path.join(dir, ...records[1].file.split('/'))
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    })

    test("the folders above it are its owner's only, from .serverless/dev down", () => {
      const dir = serviceDir()
      // An earlier session's folder, made readable by others, is tightened too.
      fs.mkdirSync(path.join(devDir(dir), 'invocations'), {
        recursive: true,
        mode: 0o755,
      })
      fs.chmodSync(path.join(devDir(dir), 'invocations'), 0o755)
      const { rec, records } = recorder({ dir })
      run(rec, { reply: { kind: 'response', body: Buffer.from('{}') } })
      const file = path.join(dir, ...records[1].file.split('/'))
      for (const folder of [
        path.dirname(file),
        path.join(devDir(dir), 'invocations'),
        devDir(dir),
      ]) {
        expect(fs.statSync(folder).mode & 0o777).toBe(0o700)
      }
    })
  }

  test.each([
    [
      'a timeout',
      errorReply('Sandbox.Timedout', 'Task timed out after 6.00 seconds'),
      false,
      'timeout',
    ],
    [
      'a worker that exited',
      errorReply(
        'Runtime.ExitError',
        'Runtime exited with error: signal: SIGKILL',
      ),
      true,
      'worker_exited',
    ],
    [
      'an init error',
      errorReply('Runtime.ImportModuleError', 'no module', 'init_error'),
      false,
      'error',
    ],
  ])('%s has its outcome', (_, reply, exited, outcome) => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    const requestId = 'req-00000001'
    rec.start({
      functionKey: 'createOrder',
      requestId,
      event: { a: 1 },
      eventBytes: bytesOf({ a: 1 }),
    })
    if (exited)
      rec.workerExited({
        functionKey: 'createOrder',
        requestId,
        code: null,
        signal: 'SIGKILL',
      })
    rec.end({
      functionKey: 'createOrder',
      requestId,
      event: { a: 1 },
      eventBytes: bytesOf({ a: 1 }),
      reply,
      durationMs: 5,
    })
    expect(records[1].outcome).toBe(outcome)
    expect(fileOf(dir, records[1]).outcome).toBe(outcome)
  })

  test('a streamed response keeps its head, redacted, and counts every byte', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir, limits: { bodyInlineBytes: 64 } })
    const prelude = Buffer.from(
      JSON.stringify({
        statusCode: 202,
        headers: { 'set-cookie': SECRET },
        cookies: [SECRET],
      }),
    )
    const bodyHead = Buffer.concat([
      prelude,
      Buffer.alloc(8),
      Buffer.from('chunk one;'),
    ])
    run(rec, {
      event: {
        requestContext: {
          http: { method: 'GET' },
          domainName: 'x.lambda-url.us-east-1.on.aws',
        },
        version: '2.0',
      },
      reply: {
        kind: 'stream',
        contentType: 'application/vnd.awslambda.http-integration-response',
        body: Readable.from([]),
      },
      extraEnd: {
        trailers: {},
        chunks: 2,
        firstByteMs: 3,
        head: bodyHead,
        contentType: 'application/vnd.awslambda.http-integration-response',
        bodyHead,
        bodyBytes: bodyHead.length + 5_000,
      },
    })
    const file = fileOf(dir, records[1])
    expect(file).toMatchObject({
      outcome: 'ok',
      status_code: 202,
      response: {
        statusCode: 202,
        headers: { 'set-cookie': '[redacted]' },
        cookies: ['[redacted]'],
        body: 'chunk one;',
      },
      response_truncated: true,
      response_bytes: bodyHead.length + 5_000,
    })
    expect(allText(devDir(dir))).not.toContain(SECRET)
  })

  test('a stream head cut inside a character keeps its text up to that character', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    // "é" is two bytes in UTF-8: each head below ends after its first byte.
    const plain = Buffer.from('café au lait').subarray(0, 4)
    run(rec, {
      event: { a: 1 },
      reply: { kind: 'stream', body: Readable.from([]) },
      extraEnd: {
        trailers: {},
        firstByteMs: 1,
        head: plain,
        bodyHead: plain,
        bodyBytes: 5_000,
      },
    })
    expect(fileOf(dir, records[1])).toMatchObject({
      response: 'caf',
      response_truncated: true,
      response_bytes: 5_000,
    })
    const prelude = Buffer.concat([
      Buffer.from('{"statusCode":200}'),
      Buffer.alloc(8),
      Buffer.from('déjà').subarray(0, 2),
    ])
    run(rec, {
      requestId: 'req-prelude',
      event: { a: 1 },
      reply: {
        kind: 'stream',
        contentType: 'application/vnd.awslambda.http-integration-response',
        body: Readable.from([]),
      },
      extraEnd: {
        trailers: {},
        firstByteMs: 1,
        head: prelude,
        contentType: 'application/vnd.awslambda.http-integration-response',
        bodyHead: prelude,
        bodyBytes: 5_000,
      },
    })
    expect(fileOf(dir, records[3])).toMatchObject({
      response: { statusCode: 200, body: 'd' },
      response_truncated: true,
    })
  })

  test('bodies over the inline limit are cut, after redaction, and keep their full size', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir, limits: { bodyInlineBytes: 100 } })
    const event = { headers: { authorization: SECRET }, body: 'x'.repeat(500) }
    run(rec, {
      event,
      reply: { kind: 'response', body: Buffer.from('y'.repeat(300)) },
    })
    const file = fileOf(dir, records[1])
    expect(file.event_truncated).toBe(true)
    expect(file.event_bytes).toBe(bytesOf(event).length)
    expect(Buffer.byteLength(file.event)).toBeLessThanOrEqual(100)
    expect(file.event).toContain('[redacted]')
    expect(file).toMatchObject({
      response: 'y'.repeat(100),
      response_truncated: true,
      response_bytes: 300,
    })
    expect(BODY_INLINE_BYTES).toBe(1024 * 1024)
  })

  test('logs keep at most the line and byte limits', () => {
    const dir = serviceDir()
    const { rec, records } = recorder({
      dir,
      limits: { logLines: 2, logBytes: 1_000 },
    })
    run(rec, {
      logs: ['a', 'b', 'c'],
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    expect(fileOf(dir, records[1]).logs).toEqual({
      lines: ['a', 'b'],
      truncated: true,
    })
    const second = recorder({ dir, limits: { logLines: 10, logBytes: 5 } })
    run(second.rec, {
      requestId: 'req-2',
      logs: ['abc', 'def'],
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    expect(fileOf(dir, second.records[1]).logs).toEqual({
      lines: ['abc'],
      truncated: true,
    })
  })

  test('a file that cannot be written leaves the record without a file and the session going', () => {
    const dir = serviceDir()
    fs.mkdirSync(devDir(dir), { recursive: true })
    // A file where the invocations directory should be.
    fs.writeFileSync(path.join(devDir(dir), 'invocations'), '')
    const warnings = []
    const records = []
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      events: { emit: (type, fields) => records.push({ type, ...fields }) },
      onWarning: (line) => warnings.push(line),
    })
    run(rec, { reply: { kind: 'response', body: Buffer.from('{}') } })
    expect(records[1]).toMatchObject({
      type: 'invocation.end',
      outcome: 'ok',
      file: null,
    })
    expect(warnings).toEqual([
      expect.stringContaining('Dev Mode keeps no invocation files'),
    ])
  })
})

describe('a failed write', () => {
  test('leaves no temporary file behind', () => {
    const dir = serviceDir()
    const records = []
    const errors = []
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      fs: {
        ...fs,
        renameSync: () => {
          throw Object.assign(new Error('operation not permitted'), {
            code: 'EPERM',
          })
        },
      },
      events: { emit: (type, fields) => records.push({ type, ...fields }) },
      onError: (error) => errors.push(error.code),
    })
    run(rec, { reply: { kind: 'response', body: Buffer.from('{}') } })
    expect(records[1].file).toBeNull()
    expect(errors).toEqual(['EPERM'])
    const folder = path.join(devDir(dir), 'invocations', 'createOrder')
    expect(fs.readdirSync(folder)).toEqual([])
  })
})

describe('retention', () => {
  test.each([
    ['file', { filesPerFunction: 1 }],
    ['byte', { bytesPerService: 1 }],
  ])(
    'never removes the file it just wrote, even when that invocation started first (%s limit)',
    (_, limits) => {
      const dir = serviceDir()
      const now = clock()
      const { rec, records } = recorder({ dir, now, limits })
      const startOf = (requestId) =>
        rec.start({
          functionKey: 'createOrder',
          requestId,
          event: { a: 1 },
          eventBytes: bytesOf({ a: 1 }),
        })
      const endOf = (requestId) =>
        rec.end({
          functionKey: 'createOrder',
          requestId,
          event: { a: 1 },
          eventBytes: bytesOf({ a: 1 }),
          reply: { kind: 'response', body: Buffer.from('{}') },
          durationMs: 5,
        })
      startOf('req-slow')
      now.advance(2_000)
      startOf('req-fast')
      endOf('req-fast')
      now.advance(2_000)
      endOf('req-slow')
      const slow = records.find(
        (record) =>
          record.type === 'invocation.end' && record.request_id === 'req-slow',
      )
      expect(fs.existsSync(path.join(dir, ...slow.file.split('/')))).toBe(true)
      expect(
        fs.readdirSync(path.join(devDir(dir), 'invocations', 'createOrder')),
      ).toEqual([slow.file.split('/').at(-1)])
    },
  )

  test('keeps the newest files per function, oldest removed first', () => {
    const dir = serviceDir()
    const { rec, now } = recorder({ dir, limits: { filesPerFunction: 3 } })
    for (let n = 1; n <= 5; n += 1) {
      now.advance(1_000)
      run(rec, {
        requestId: `req-${n}`,
        reply: { kind: 'response', body: Buffer.from('{}') },
      })
    }
    const names = fs
      .readdirSync(path.join(devDir(dir), 'invocations', 'createOrder'))
      .sort()
    expect(names.map((name) => name.split('-').slice(1).join('-'))).toEqual([
      'req-3.json',
      'req-4.json',
      'req-5.json',
    ])
    expect(INVOCATION_FILES_PER_FUNCTION).toBe(500)
  })

  test('keeps the service under its byte limit across functions, counting files of earlier sessions', () => {
    // One invocation file's size, measured: every file below has the same size.
    const sample = serviceDir()
    const measured = recorder({ dir: sample })
    run(measured.rec, {
      requestId: 'req-s',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    const size = fs.statSync(
      path.join(sample, ...measured.records[1].file.split('/')),
    ).size
    const dir = serviceDir()
    const old = path.join(devDir(dir), 'invocations', 'report')
    fs.mkdirSync(old, { recursive: true })
    fs.writeFileSync(path.join(old, '1000-old.json'), 'z'.repeat(size))
    // Room for one file, not two.
    const { rec, now } = recorder({
      dir,
      limits: { bytesPerService: 2 * size - 1 },
    })
    run(rec, {
      requestId: 'req-a',
      now,
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    // The earlier session's file was the oldest: it went first.
    expect(fs.existsSync(path.join(old, '1000-old.json'))).toBe(false)
    now.advance(1_000)
    run(rec, {
      requestId: 'req-b',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    const kept = fs.readdirSync(
      path.join(devDir(dir), 'invocations', 'createOrder'),
    )
    expect(kept.map((name) => name.split('-').slice(1).join('-'))).toEqual([
      'req-b.json',
    ])
    expect(INVOCATION_BYTES_PER_SERVICE).toBe(200 * 1024 * 1024)
  })
})

describe('a kept file that cannot be deleted', () => {
  // rmSync throws `code` for the files named in `failing` (as on Windows for a file another
  // process holds open); with ENOENT the file is gone first, as when something else removed it.
  const failingFs = (failing, code) => ({
    ...fs,
    rmSync: (file, options) => {
      if (failing.has(path.basename(file))) {
        if (code === 'ENOENT') fs.rmSync(file, options)
        throw Object.assign(new Error(`${code}: ${file}`), { code })
      }
      return fs.rmSync(file, options)
    },
  })
  const fileNames = (dir) =>
    fs
      .readdirSync(path.join(devDir(dir), 'invocations', 'createOrder'))
      .map((name) => name.split('-').slice(1).join('-'))
      .sort()

  test('stays counted and is deleted by a later prune', () => {
    const dir = serviceDir()
    const failing = new Set()
    const errors = []
    const now = clock()
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      now,
      fs: failingFs(failing, 'EBUSY'),
      events: { emit() {} },
      onError: (error) => errors.push(error.code),
      limits: { filesPerFunction: 2 },
    })
    const reply = { kind: 'response', body: Buffer.from('{}') }
    for (const n of [1, 2]) {
      now.advance(1_000)
      run(rec, { requestId: `req-${n}`, reply })
    }
    const [first] = fs
      .readdirSync(path.join(devDir(dir), 'invocations', 'createOrder'))
      .sort()
    failing.add(first)
    now.advance(1_000)
    run(rec, { requestId: 'req-3', reply })
    expect(fileNames(dir)).toEqual(['req-1.json', 'req-2.json', 'req-3.json'])
    expect(errors).toEqual(['EBUSY'])
    // Once it can be deleted, the next prune deletes it with the file over the limit.
    failing.clear()
    now.advance(1_000)
    run(rec, { requestId: 'req-4', reply })
    expect(fileNames(dir)).toEqual(['req-3.json', 'req-4.json'])
  })

  test('that is already gone counts as deleted, with no error', () => {
    const dir = serviceDir()
    const failing = new Set()
    const errors = []
    const now = clock()
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      now,
      fs: failingFs(failing, 'ENOENT'),
      events: { emit() {} },
      onError: (error) => errors.push(error.code),
      limits: { filesPerFunction: 1 },
    })
    const reply = { kind: 'response', body: Buffer.from('{}') }
    now.advance(1_000)
    run(rec, { requestId: 'req-1', reply })
    failing.add(
      fs.readdirSync(path.join(devDir(dir), 'invocations', 'createOrder'))[0],
    )
    for (const n of [2, 3]) {
      now.advance(1_000)
      run(rec, { requestId: `req-${n}`, reply })
    }
    expect(fileNames(dir)).toEqual(['req-3.json'])
    expect(errors).toEqual([])
  })
})

describe('a rewrite that fails after the old file was removed', () => {
  test('no longer counts the removed file toward the byte limit', () => {
    const sample = serviceDir()
    const measured = recorder({ dir: sample })
    run(measured.rec, {
      requestId: 'req-s',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    const size = fs.statSync(
      path.join(sample, ...measured.records[1].file.split('/')),
    ).size
    const dir = serviceDir()
    const old = path.join(devDir(dir), 'invocations', 'report', '1000-old.json')
    fs.mkdirSync(path.dirname(old), { recursive: true })
    fs.writeFileSync(old, 'z'.repeat(size))
    // Both renames of a rewrite fail, as on Windows when another process holds the folder.
    let failRenames = false
    const now = clock()
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      now,
      fs: {
        ...fs,
        renameSync: (from, to) => {
          if (failRenames) {
            throw Object.assign(new Error('operation not permitted'), {
              code: 'EPERM',
            })
          }
          return fs.renameSync(from, to)
        },
      },
      events: { emit() {} },
      onError: () => {},
      // Room for two files.
      limits: { bytesPerService: 2 * size },
    })
    const reply = { kind: 'response', body: Buffer.from('{}') }
    run(rec, { requestId: 'req-a', reply })
    // A retry keeps its request id: the same file is written again, and both renames fail.
    failRenames = true
    run(rec, { requestId: 'req-a', reply })
    failRenames = false
    now.advance(1_000)
    run(rec, { requestId: 'req-b', reply })
    // Two files are on disk: the earlier session's and req-b's.
    expect(fs.existsSync(old)).toBe(true)
  })
})

describe('replay memory', () => {
  test('keeps the raw events of the latest invocations, by full id or a unique prefix', () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir, limits: { replayPerFunction: 2 } })
    for (const id of ['aaaaaaaa-1', 'aaaaaaaa-2', 'bbbbbbbb-3']) {
      run(rec, {
        requestId: id,
        reply: { kind: 'response', body: Buffer.from('{}') },
      })
    }
    expect(rec.rawEventOf('aaaaaaaa-1')).toBeNull()
    const kept = rec.rawEventOf('bbbbbbbb')
    expect(kept).toMatchObject({
      requestId: 'bbbbbbbb-3',
      functionKey: 'createOrder',
      environmentId: 'env-1',
      source: 'caller',
    })
    // The raw event is not redacted: replay runs what the caller sent.
    expect(kept.eventBytes.toString()).toContain(SECRET)
    expect(rec.rawEventOf('aaaaaaaa-2')).not.toBeNull()
    // Shorter than 8 characters and not a whole id: too short to pick one request.
    expect(() => rec.rawEventOf('bbbb')).toThrow(
      expect.objectContaining({ reason: 'ambiguous_request_id' }),
    )
    run(rec, {
      requestId: 'bbbbbbbb-4',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    expect(() => rec.rawEventOf('bbbbbbbb')).toThrow(
      expect.objectContaining({ reason: 'ambiguous_request_id' }),
    )
    expect(REPLAY_EVENTS_PER_FUNCTION).toBe(50)
  })

  test('an id with surrounding blanks is found like the readers find it', () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir })
    run(rec, {
      requestId: 'r-1',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    run(rec, {
      requestId: 'cccccccc-5',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    expect(rec.rawEventOf(' r-1\n')).toMatchObject({ requestId: 'r-1' })
    expect(rec.rawEventOf('  cccccccc ')).toMatchObject({
      requestId: 'cccccccc-5',
    })
  })

  test('an exact id of any length is found first', () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir })
    run(rec, {
      requestId: 'r-1',
      reply: { kind: 'response', body: Buffer.from('{}') },
    })
    expect(rec.rawEventOf('r-1')).toMatchObject({ requestId: 'r-1' })
    expect(rec.rawEventOf('r-1').eventBytes.toString()).toContain(SECRET)
  })

  test('drops the oldest events first past its byte limit', () => {
    const dir = serviceDir()
    const size = bytesOf(httpApiEvent).length
    const { rec } = recorder({ dir, limits: { replayBytes: size * 2 } })
    for (const id of ['req-00000001', 'req-00000002', 'req-00000003']) {
      run(rec, {
        requestId: id,
        reply: { kind: 'response', body: Buffer.from('{}') },
      })
    }
    expect(rec.rawEventOf('req-00000001')).toBeNull()
    expect(rec.rawEventOf('req-00000003')).not.toBeNull()
    expect(REPLAY_BYTES).toBe(64 * 1024 * 1024)
  })
})

describe('replays', () => {
  const ORIGINAL_ID = '3f2a9c1e-0000-4000-8000-00000000000b'
  const REPLAY_ID = '9b1c2d3e-0000-4000-8000-00000000000a'
  const ok = { kind: 'response', body: Buffer.from('{}') }
  const emitted = (records, type) =>
    records.filter((record) => record.type === type).at(-1)
  const savedFiles = (dir, functionKey) => {
    const folder = path.join(devDir(dir), 'invocations', functionKey)
    return fs.readdirSync(folder).map((name) => path.join(folder, name))
  }

  test('a replay is recorded with source replay and the id it replays', async () => {
    const dir = serviceDir()
    const { rec, records } = recorder({ dir })
    rec.expectReplay({ requestId: REPLAY_ID, replayOf: ORIGINAL_ID })
    const ended = rec.whenEnded(REPLAY_ID)
    run(rec, { requestId: REPLAY_ID, source: 'replay', reply: ok })
    const { file } = await ended
    const saved = JSON.parse(
      fs.readFileSync(path.join(dir, ...file.split('/')), 'utf8'),
    )
    expect(saved).toMatchObject({
      source: 'replay',
      replay_of: ORIGINAL_ID,
      request_id: REPLAY_ID,
    })
    expect(emitted(records, 'invocation.start')).toMatchObject({
      request_id: REPLAY_ID,
      source: 'replay',
    })
    expect(emitted(records, 'invocation.end')).toMatchObject({
      request_id: REPLAY_ID,
      source: 'replay',
      file,
    })
  })

  test('an invocation that is not a replay stays a caller invocation without replay_of', async () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir })
    const ended = rec.whenEnded(ORIGINAL_ID)
    run(rec, { requestId: ORIGINAL_ID, source: 'caller', reply: ok })
    const { file } = await ended
    const saved = JSON.parse(
      fs.readFileSync(path.join(dir, ...file.split('/')), 'utf8'),
    )
    expect(saved.source).toBe('caller')
    expect(saved).not.toHaveProperty('replay_of')
  })

  test('a forgotten replay leaves nothing behind', () => {
    const dir = serviceDir()
    const { rec } = recorder({ dir })
    rec.expectReplay({ requestId: REPLAY_ID, replayOf: ORIGINAL_ID })
    rec.whenEnded(REPLAY_ID)
    rec.forgetReplay(REPLAY_ID)
    run(rec, { requestId: REPLAY_ID, source: 'caller', reply: ok })
    const [file] = savedFiles(dir, 'createOrder')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty(
      'replay_of',
    )
  })

  test('a replay whose file could not be written rejects its wait', async () => {
    const dir = serviceDir()
    // A file where the invocations directory should be: nothing can be written under it.
    fs.mkdirSync(devDir(dir), { recursive: true })
    fs.writeFileSync(path.join(devDir(dir), 'invocations'), '')
    const { rec, records } = recorder({ dir })
    rec.expectReplay({ requestId: REPLAY_ID, replayOf: ORIGINAL_ID })
    const ended = rec.whenEnded(REPLAY_ID)
    run(rec, { requestId: REPLAY_ID, source: 'replay', reply: ok })
    await expect(ended).rejects.toThrow(
      'Dev Mode could not write the invocation file of the replay.',
    )
    expect(emitted(records, 'invocation.end')).toMatchObject({
      request_id: REPLAY_ID,
      file: null,
    })
  })
})

describe('directories that are links', () => {
  const ok = { kind: 'response', body: Buffer.from('{}') }
  const onPosix = process.platform === 'win32' ? test.skip : test
  // A directory outside the service, holding a file named like an old invocation file.
  const outside = () => {
    const target = serviceDir()
    fs.writeFileSync(path.join(target, '1000-old.json'), 'keep me')
    return target
  }
  const linkedRecorder = (dir) => {
    const records = []
    const warnings = []
    const errors = []
    const rec = createInvocationRecorder({
      dir: devDir(dir),
      now: clock(),
      events: { emit: (type, fields) => records.push({ type, ...fields }) },
      // Room for no earlier file: retention would remove every one it inventories.
      limits: { bytesPerService: 1 },
      onWarning: (line) => warnings.push(line),
      onError: (error) => errors.push(error),
    })
    return { rec, records, warnings, errors }
  }

  test.each([
    ['the invocations directory', ['invocations']],
    ['a function directory', ['invocations', 'createOrder']],
    ['.serverless/dev', []],
  ])(
    'when %s is a link, nothing is written, read or removed through it, with one warning',
    (_, segments) => {
      const dir = serviceDir()
      const target = outside()
      const at = path.join(devDir(dir), ...segments)
      fs.mkdirSync(path.dirname(at), { recursive: true })
      // A junction on Windows (no privilege needed); a symbolic link elsewhere.
      fs.symlinkSync(target, at, 'junction')
      const { rec, records, warnings, errors } = linkedRecorder(dir)
      run(rec, { requestId: 'req-1', reply: ok })
      run(rec, { requestId: 'req-2', reply: ok })
      expect(fs.readdirSync(target)).toEqual(['1000-old.json'])
      expect(fs.readFileSync(path.join(target, '1000-old.json'), 'utf8')).toBe(
        'keep me',
      )
      expect(
        records
          .filter((record) => record.type === 'invocation.end')
          .map((record) => record.file),
      ).toEqual([null, null])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('not a directory')
      expect(errors).toEqual([])
    },
  )

  onPosix('a link at a temporary file name is never written through', () => {
    const dir = serviceDir()
    const target = path.join(outside(), '1000-old.json')
    const folder = path.join(devDir(dir), 'invocations', 'createOrder')
    fs.mkdirSync(folder, { recursive: true })
    const now = clock()
    const name = `${Math.floor(now() / 1000)}-req-1.json`
    // The name a temporary file would have if it could be predicted.
    fs.symlinkSync(target, path.join(folder, `.${name}.${process.pid}.tmp`))
    const { rec, records } = recorder({ dir, now })
    run(rec, { requestId: 'req-1', reply: ok })
    expect(fs.readFileSync(target, 'utf8')).toBe('keep me')
    const written = path.join(dir, ...records[1].file.split('/'))
    expect(fs.lstatSync(written).isFile()).toBe(true)
    expect(fs.statSync(written).mode & 0o777).toBe(0o600)
  })

  onPosix(
    'retention removes only regular files, never what a link names',
    () => {
      const dir = serviceDir()
      const target = path.join(outside(), '1000-old.json')
      const folder = path.join(devDir(dir), 'invocations', 'report')
      fs.mkdirSync(folder, { recursive: true })
      const link = path.join(folder, '1000-linked.json')
      fs.symlinkSync(target, link)
      const { rec } = recorder({ dir, limits: { bytesPerService: 1 } })
      run(rec, { requestId: 'req-1', reply: ok })
      expect(fs.readFileSync(target, 'utf8')).toBe('keep me')
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
    },
  )
})
