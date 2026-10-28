import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createInvocationRecorder } from '../../../../../../../lib/plugins/aws/dev/state/invocations.js'
import { createRecordFiles } from '../../../../../../../lib/plugins/aws/dev/state/record-files.js'
import {
  REQUEST_BODY_BYTES,
  REQUEST_FILES_PER_WEB_APP,
  bodyBytesOf,
  createRequestRecorder,
  withoutRedactedHeaders,
  withoutRedactedParameters,
} from '../../../../../../../lib/plugins/aws/dev/state/requests.js'
import {
  findRecorded,
  findRequest,
  listWebRequests,
} from '../../../../../../../lib/plugins/aws/dev/state/read.js'
import { INVOCATION_BYTES_PER_SERVICE } from '../../../../../../../lib/plugins/aws/dev/state/invocations.js'

const SECRET = 'sk-test-0123456789'
const START = Date.parse('2026-10-05T10:41:07.512Z')
const ID = '7d3c1a2b-0000-4000-8000-000000000001'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const devDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return path.join(dir, '.serverless', 'dev')
}
const allText = (dir) => {
  const texts = []
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name)
      if (entry.isDirectory()) walk(file)
      else texts.push(fs.readFileSync(file, 'utf8'))
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return texts.join('\n')
}
const clock = () => {
  let t = START
  const now = () => t
  now.advance = (ms) => {
    t += ms
  }
  return now
}
const recorder = ({ dir = devDir(), limits, files, now = clock() } = {}) => {
  const records = []
  const rec = createRequestRecorder({
    dir,
    now,
    events: { emit: (type, fields) => records.push({ type, ...fields }) },
    limits,
    files,
    stage: 'alice',
  })
  return { rec, records, now, dir }
}
const fileOf = (dir, recordPath) =>
  JSON.parse(
    fs.readFileSync(path.join(dir, ...recordPath.split('/').slice(2)), 'utf8'),
  )

/** One request as the relay reports it (no source), with what the dispatch noted. */
const relayed = (
  rec,
  now,
  {
    id = ID,
    key = 'api',
    path: at = '/orders',
    headers = {},
    body,
    response,
    end,
  } = {},
) => {
  rec.start({
    id,
    key,
    method: 'POST',
    path: at,
    environmentId: 'env-1',
    at: now(),
  })
  rec.note({ id, headers })
  if (body) rec.note({ id, requestBody: { head: body, bytes: body.length } })
  if (response) {
    rec.note({
      id,
      response: { status: response.status, headers: response.headers },
    })
    rec.note({
      id,
      responseBody: { head: response.body, bytes: response.body.length },
    })
  }
  now.advance(12)
  rec.end({
    id,
    key,
    at: now(),
    durationMs: 12,
    outcome: 'answered',
    status: response?.status ?? 200,
    bytes: response?.body.length ?? 0,
    ...end,
  })
}

describe('web request records', () => {
  test('authorization and cookies are redacted in the request file', () => {
    const { rec, records, now, dir } = recorder()
    relayed(rec, now, {
      headers: {
        authorization: `Bearer ${SECRET}`,
        cookie: `session=${SECRET}`,
        'x-amz-security-token': SECRET,
        'x-amz-date': '20261005T104107Z',
        'content-type': 'application/json',
      },
      body: Buffer.from('{"item":"tea"}'),
      response: {
        status: 201,
        headers: {
          'set-cookie': [`session=${SECRET}`, `other=${SECRET}`],
          'content-type': 'text/plain',
        },
        body: Buffer.from('created'),
      },
    })
    expect(allText(dir)).not.toContain(SECRET)
    const end = records.find((record) => record.type === 'request.end')
    const saved = fileOf(dir, end.file)
    expect(end.file).toBe(
      `.serverless/dev/requests/api/${Math.floor(START / 1000)}-${ID}.json`,
    )
    expect(saved).toMatchObject({
      v: 1,
      request_id: ID,
      web_app: 'api',
      stage: 'alice',
      source: 'relay',
      outcome: 'answered',
      status_code: 201,
      duration_ms: 12,
      request: {
        method: 'POST',
        path: '/orders',
        headers: {
          authorization: '[redacted]',
          cookie: '[redacted]',
          'x-amz-security-token': '[redacted]',
          'x-amz-date': '[redacted]',
          'content-type': 'application/json',
        },
        body: '{"item":"tea"}',
        body_encoding: 'text',
        body_truncated: false,
        body_bytes: 14,
      },
      response: {
        status_code: 201,
        headers: { 'set-cookie': ['[redacted]', '[redacted]'] },
        body: 'created',
        body_encoding: 'text',
        body_bytes: 7,
      },
    })
    expect(saved.redacted).toEqual([
      'request.headers.authorization',
      'request.headers.cookie',
      'request.headers.x-amz-security-token',
      'request.headers.x-amz-date',
      'response.headers.set-cookie',
    ])
  })

  test('the values of a signed URL are redacted in the recorded path and the events', () => {
    const { rec, records, now, dir } = recorder()
    const signed = `/files?a=1&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIDEXAMPLE%2F20261005&X-Amz-Signature=${SECRET}&x-amz-security-token=${SECRET}`
    relayed(rec, now, { path: signed })
    expect(allText(dir)).not.toContain(SECRET)
    expect(JSON.stringify(records)).not.toContain(SECRET)
    expect(JSON.stringify(records)).not.toContain('AKIDEXAMPLE')
    const shown =
      '/files?a=1&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=[redacted]&X-Amz-Signature=[redacted]&x-amz-security-token=[redacted]'
    expect(records[0]).toMatchObject({ type: 'request.start', path: shown })
    const saved = fileOf(dir, records[1].file)
    expect(saved.request.path).toBe(shown)
    expect(saved.redacted).toEqual([
      'request.query.X-Amz-Credential',
      'request.query.X-Amz-Signature',
      'request.query.x-amz-security-token',
    ])
    // A replay sends the path without them.
    expect(withoutRedactedParameters(shown)).toEqual({
      path: '/files?a=1&X-Amz-Algorithm=AWS4-HMAC-SHA256',
      omitted: ['X-Amz-Credential', 'X-Amz-Signature', 'x-amz-security-token'],
    })
    expect(withoutRedactedParameters('/plain')).toEqual({
      path: '/plain',
      omitted: [],
    })
  })

  test('the tokens of an OAuth callback are redacted; its one-time code is kept', () => {
    const { rec, records, now, dir } = recorder()
    const callback = `/callback?code=abc&state=s1&access_token=${SECRET}&id_token=${SECRET}&Refresh_Token=${SECRET}&token=${SECRET}&client_secret=${SECRET}`
    relayed(rec, now, { path: callback })
    expect(allText(dir)).not.toContain(SECRET)
    expect(JSON.stringify(records)).not.toContain(SECRET)
    expect(records[0].path).toBe(
      '/callback?code=abc&state=s1&access_token=[redacted]&id_token=[redacted]&Refresh_Token=[redacted]&token=[redacted]&client_secret=[redacted]',
    )
  })

  test('the events are request.start and request.end; a start without a source is a relayed request', () => {
    const { rec, records, now } = recorder()
    relayed(rec, now, {
      response: { status: 200, headers: {}, body: Buffer.from('ok') },
    })
    expect(records).toEqual([
      {
        type: 'request.start',
        web_app: 'api',
        request_id: ID,
        method: 'POST',
        path: '/orders',
        source: 'relay',
      },
      {
        type: 'request.end',
        web_app: 'api',
        request_id: ID,
        source: 'relay',
        method: 'POST',
        path: '/orders',
        outcome: 'answered',
        status_code: 200,
        duration_ms: 12,
        bytes: 2,
        reason: undefined,
        file: `.serverless/dev/requests/api/${Math.floor(START / 1000)}-${ID}.json`,
      },
    ])
  })

  test('a request that did not run has no status code, whether the relay (null) or the dispatch (503) reported it', () => {
    const { rec, records, now, dir } = recorder()
    for (const [id, source, status] of [
      ['relay-000000001', undefined, null],
      ['local-000000002', 'local', 503],
    ]) {
      rec.start({ id, key: 'api', method: 'GET', path: '/', source, at: now() })
      rec.end({
        id,
        key: 'api',
        at: now(),
        durationMs: 3,
        outcome: 'not_run',
        status,
        bytes: 0,
        reason: 'web app api is not running on this machine',
      })
    }
    const ends = records.filter((record) => record.type === 'request.end')
    expect(
      ends.map((end) => [end.source, end.outcome, end.status_code]),
    ).toEqual([
      ['relay', 'not_run', null],
      ['local', 'not_run', null],
    ])
    for (const end of ends) {
      expect(fileOf(dir, end.file)).toMatchObject({
        outcome: 'not_run',
        status_code: null,
        reason: 'web app api is not running on this machine',
        response: null,
      })
    }
  })

  test('counts the requests that ended and names the last one, as dev status shows them', () => {
    const { rec, now } = recorder()
    expect(rec.counts()).toEqual({ total: 0, failed: 0 })
    expect(rec.lastRequest()).toBeNull()
    relayed(rec, now, { id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    relayed(rec, now, {
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      key: 'admin',
      end: { outcome: 'not_run', status: null, reason: 'down' },
    })
    expect(rec.counts()).toEqual({ total: 2, failed: 1 })
    expect(rec.lastRequest()).toEqual({
      request_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      web_app: 'admin',
      outcome: 'not_run',
      ts: new Date(now()).toISOString(),
    })
  })

  test('a failure the stop gave up on records outcome failed with no status code', () => {
    const { rec, records, now } = recorder()
    rec.start({ id: ID, key: 'api', method: 'GET', path: '/', at: now() })
    rec.end({
      id: ID,
      key: 'api',
      at: now(),
      durationMs: 1,
      outcome: 'failed',
      status: null,
      bytes: 0,
      reason: 'the session stopped before the local server answered',
    })
    expect(records[1]).toMatchObject({
      outcome: 'failed',
      status_code: null,
      reason: 'the session stopped before the local server answered',
    })
  })

  test('a body the record never saw is unknown; no body by the headers is an empty one', () => {
    const { rec, records, now, dir } = recorder()
    for (const [id, headers] of [
      ['unknown-0000001', { 'content-length': '14' }],
      ['chunked-0000002', { 'Transfer-Encoding': 'chunked' }],
      ['empty-00000003', { accept: '*/*' }],
    ]) {
      rec.start({
        id,
        key: 'api',
        method: 'POST',
        path: '/',
        headers,
        source: 'local',
        at: now(),
      })
      rec.end({ id, key: 'api', outcome: 'not_run', status: 503, bytes: 0 })
    }
    const requests = records
      .filter((record) => record.type === 'request.end')
      .map((end) => fileOf(dir, end.file).request)
    expect(
      requests.map((request) => [
        request.body_captured,
        request.body_bytes,
        request.body,
      ]),
    ).toEqual([
      [false, null, null],
      [false, null, null],
      [true, 0, ''],
    ])
  })

  test('the credentials request of a --local-only web app is never recorded', () => {
    const { rec, records, dir, now } = recorder()
    rec.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/__serverless-dev/credentials?x=1',
      source: 'local',
      at: now(),
    })
    rec.end({ id: ID, key: 'api', outcome: 'answered', status: 204, bytes: 0 })
    expect(records).toEqual([])
    expect(fs.existsSync(path.join(dir, 'requests'))).toBe(false)
  })

  test('a body past 1 MiB is cut and says so; a binary body is base64', () => {
    const { rec, records, now, dir } = recorder()
    const big = Buffer.alloc(REQUEST_BODY_BYTES + 10, 'a')
    rec.start({
      id: ID,
      key: 'api',
      method: 'PUT',
      path: '/upload',
      source: 'local',
      at: now(),
    })
    rec.note({
      id: ID,
      requestBody: {
        head: big.subarray(0, REQUEST_BODY_BYTES),
        bytes: big.length,
      },
      response: { status: 200, headers: {} },
      responseBody: { head: Buffer.from([0xff, 0x00, 0xfe]), bytes: 3 },
    })
    rec.end({
      id: ID,
      key: 'api',
      outcome: 'answered',
      status: 200,
      bytes: 3,
      durationMs: 4,
    })
    const saved = fileOf(dir, records[1].file)
    expect(saved.request).toMatchObject({
      body_encoding: 'text',
      body_truncated: true,
      body_bytes: REQUEST_BODY_BYTES + 10,
    })
    expect(saved.request.body).toHaveLength(REQUEST_BODY_BYTES)
    expect(saved.response).toMatchObject({
      body: Buffer.from([0xff, 0x00, 0xfe]).toString('base64'),
      body_encoding: 'base64',
      body_truncated: false,
      body_bytes: 3,
    })
    expect(bodyBytesOf(saved.response)).toEqual(Buffer.from([0xff, 0x00, 0xfe]))
  })

  test('a replay names the request it replays, and whoever waits for it learns its file', async () => {
    const { rec, now, dir } = recorder()
    rec.expectReplay({ requestId: 'replay-0000001', replayOf: ID })
    const ended = rec.whenEnded('replay-0000001')
    rec.start({
      id: 'replay-0000001',
      key: 'api',
      method: 'GET',
      path: '/',
      source: 'replay',
      at: now(),
    })
    rec.end({
      id: 'replay-0000001',
      key: 'api',
      outcome: 'answered',
      status: 200,
      bytes: 0,
      durationMs: 1,
    })
    const { file } = await ended
    expect(fileOf(dir, file)).toMatchObject({
      source: 'replay',
      replay_of: ID,
    })
  })

  test('replayed headers leave out the redacted ones', () => {
    expect(
      withoutRedactedHeaders({
        authorization: '[redacted]',
        'set-cookie': ['[redacted]'],
        accept: 'text/html',
      }),
    ).toEqual({
      headers: { accept: 'text/html' },
      omitted: ['authorization', 'set-cookie'],
    })
  })
})

describe('limits shared with the invocation files', () => {
  test(`at most ${REQUEST_FILES_PER_WEB_APP} files per web app by default, oldest first`, () => {
    const { rec, records, now, dir } = recorder({
      limits: { filesPerWebApp: 2 },
    })
    for (let n = 1; n <= 3; n += 1) {
      relayed(rec, now, { id: `request-0000000${n}` })
      now.advance(1000)
    }
    relayed(rec, now, { id: 'request-other', key: 'web' })
    expect(
      listWebRequests({ dir, webAppKey: 'api' }).map((row) => row.request_id),
    ).toEqual(['request-00000003', 'request-00000002'])
    expect(listWebRequests({ dir, webAppKey: 'web' })).toHaveLength(1)
    expect(
      records.filter((record) => record.type === 'request.end'),
    ).toHaveLength(4)
  })

  test('one byte budget for invocation and request files: the oldest of either goes first', () => {
    const dir = devDir()
    const now = clock()
    const emit = () => {}
    // A budget every file passes alone: each new file removes the older ones, whatever their kind.
    const files = createRecordFiles({ dir, bytesPerService: 1 })
    const invocations = createInvocationRecorder({
      dir,
      now,
      events: { emit },
      files,
      stage: 'alice',
    })
    const { rec } = recorder({ dir, files, now })
    invocations.start({
      functionKey: 'createOrder',
      requestId: 'inv-00000001',
      event: {},
    })
    invocations.end({
      functionKey: 'createOrder',
      requestId: 'inv-00000001',
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    expect(
      fs.readdirSync(path.join(dir, 'invocations', 'createOrder')),
    ).toHaveLength(1)
    now.advance(1000)
    relayed(rec, now, { id: 'request-00000001' })
    expect(
      fs.readdirSync(path.join(dir, 'invocations', 'createOrder')),
    ).toHaveLength(0)
    expect(fs.readdirSync(path.join(dir, 'requests', 'api'))).toHaveLength(1)
    expect(INVOCATION_BYTES_PER_SERVICE).toBe(200 * 1024 * 1024)
  })

  test('files of earlier sessions count toward the shared budget', () => {
    const dir = devDir()
    const now = clock()
    const first = recorder({ dir, now })
    relayed(first.rec, now, { id: 'request-00000001' })
    now.advance(1000)
    const size = fs.statSync(
      path.join(
        dir,
        'requests',
        'api',
        fs.readdirSync(path.join(dir, 'requests', 'api'))[0],
      ),
    ).size
    // A new session: its store reads what is kept, and keeps one file's worth.
    const second = recorder({
      dir,
      now,
      limits: { bytesPerService: size + 10 },
    })
    relayed(second.rec, now, { id: 'request-00000002' })
    expect(listWebRequests({ dir }).map((row) => row.request_id)).toEqual([
      'request-00000002',
    ])
  })
})

describe('eviction order across kinds', () => {
  /** An invocation file, then a request file, then another request file, in `dir`. */
  const writeThree = (dir, bytesPerService) => {
    const now = clock()
    const files = createRecordFiles({ dir, bytesPerService })
    const invocations = createInvocationRecorder({
      dir,
      now,
      events: { emit: () => {} },
      files,
      stage: 'alice',
    })
    const { rec } = recorder({ dir, files, now })
    const sizes = []
    const sizeOf = (sub) =>
      fs.statSync(
        path.join(dir, sub, fs.readdirSync(path.join(dir, sub)).sort().at(-1)),
      ).size
    invocations.start({
      functionKey: 'createOrder',
      requestId: 'inv-00000001',
      event: {},
    })
    invocations.end({
      functionKey: 'createOrder',
      requestId: 'inv-00000001',
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    sizes.push(sizeOf('invocations/createOrder'))
    for (const id of ['request-00000001', 'request-00000002']) {
      now.advance(1000)
      relayed(rec, now, { id })
      sizes.push(sizeOf('requests/api'))
    }
    return sizes
  }

  test('a budget of about two files: the newest file removes the oldest, the invocation, only', () => {
    // The sizes, from a run with room for everything.
    const [invocation, request, next] = writeThree(devDir(), Infinity)
    const dir = devDir()
    writeThree(dir, invocation + request + next - 1)
    expect(
      fs.readdirSync(path.join(dir, 'invocations', 'createOrder')),
    ).toEqual([])
    expect(listWebRequests({ dir }).map((row) => row.request_id)).toEqual([
      'request-00000002',
      'request-00000001',
    ])
  })
})

describe('reading request files', () => {
  test('listWebRequests rows and findRecorded / findRequest', () => {
    const { rec, now, dir } = recorder()
    relayed(rec, now, {
      response: { status: 200, headers: {}, body: Buffer.from('ok') },
    })
    expect(listWebRequests({ dir })).toEqual([
      {
        ts: new Date(START).toISOString(),
        kind: 'request',
        web_app: 'api',
        stage: 'alice',
        request_id: ID,
        source: 'relay',
        method: 'POST',
        path: '/orders',
        outcome: 'answered',
        status_code: 200,
        duration_ms: 12,
        file: `.serverless/dev/requests/api/${Math.floor(START / 1000)}-${ID}.json`,
      },
    ])
    expect(findRecorded({ dir, idOrPrefix: ID.slice(0, 8) })).toMatchObject({
      kind: 'request',
      record: { request_id: ID },
    })
    expect(findRequest({ dir, idOrPrefix: ID })).toMatchObject({
      record: { web_app: 'api' },
    })
    // An id an invocation has too names two requests.
    const invocations = createInvocationRecorder({
      dir,
      now,
      events: { emit: () => {} },
      stage: 'alice',
    })
    invocations.start({ functionKey: 'createOrder', requestId: ID, event: {} })
    invocations.end({
      functionKey: 'createOrder',
      requestId: ID,
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    expect(() => findRecorded({ dir, idOrPrefix: ID })).toThrow(
      expect.objectContaining({
        reason: 'ambiguous_request_id',
        message: `"${ID}" matches both an invocation and a web request with id ${ID}.`,
      }),
    )
    expect(() => findRequest({ dir, idOrPrefix: 'ffffffff-nope' })).toThrow(
      expect.objectContaining({ reason: 'invocation_not_found' }),
    )
  })
})
