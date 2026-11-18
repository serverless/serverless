import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { createHttpDispatch } from '../../../../../../../lib/plugins/aws/dev/web/http-dispatch.js'
import {
  BODY_TRUNCATED,
  createRequestReplayHandler,
} from '../../../../../../../lib/plugins/aws/dev/web/replay.js'
import { createRequestRecorder } from '../../../../../../../lib/plugins/aws/dev/state/requests.js'
import { devDirOf } from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import { fakeLog } from '../attach/fakes.js'

const SECRET = 'sk-test-0123456789'
const ORIGINAL = '5e4d3c2b-0000-4000-8000-000000000001'
const REPLAY = '0f0e0d0c-0000-4000-8000-000000000002'

const open = []
const dirs = []
afterEach(async () => {
  for (const server of open.splice(0)) {
    await new Promise((resolve) => server.close(resolve))
  }
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

/** A local web app server that answers 200 and keeps what it received. */
const localServer = async () => {
  const received = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  open.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { received, port: server.address().port }
}

/**
 * A session's web part: a service directory, the request recorder, the dispatch to the local
 * server, and the replay handler over them; `record(...)` records one relayed request as the relay
 * and the dispatch report it.
 */
const session = async ({ running = true } = {}) => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(serviceDir)
  const { received, port } = await localServer()
  const records = []
  const recorder = createRequestRecorder({
    dir: devDirOf(serviceDir),
    events: { emit: (type, fields) => records.push({ type, ...fields }) },
    stage: 'alice',
  })
  const servers = new Map([['api', { port, serving: true }]])
  const { dispatch } = createHttpDispatch({ servers, recorder })
  const logger = fakeLog()
  const replay = createRequestReplayHandler({
    serviceDir,
    runtime: () => ({ dispatch, runs: (key) => running && servers.has(key) }),
    recorder: () => recorder,
    logger,
    randomUUID: () => REPLAY,
  })
  const record = async ({ body, path: at, headers }) => {
    recorder.start({ id: ORIGINAL, key: 'api', method: 'POST', path: at })
    recorder.note({ id: ORIGINAL, headers })
    recorder.note({
      id: ORIGINAL,
      requestBody: {
        head: body.subarray(0, recorder.captureBytes),
        bytes: body.length,
      },
    })
    recorder.end({
      id: ORIGINAL,
      key: 'api',
      durationMs: 5,
      outcome: 'answered',
      status: 200,
      bytes: 11,
    })
  }
  return {
    serviceDir,
    received,
    records,
    replay,
    record,
    logger,
    dispatch,
    recorder,
    server: servers.get('api'),
  }
}

describe('dev replay of a web request', () => {
  test('replay sends the recorded request to the local server and records source replay', async () => {
    const { serviceDir, received, records, replay, record, logger } =
      await session()
    await record({
      body: Buffer.from('{"item":"tea"}'),
      path: `/orders?page=2&X-Amz-Signature=${SECRET}`,
      headers: {
        authorization: `Bearer ${SECRET}`,
        'content-type': 'application/json',
        'x-request-tag': 'one',
      },
    })
    const fields = await replay(ORIGINAL.slice(0, 8))
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      method: 'POST',
      url: '/orders?page=2',
      body: '{"item":"tea"}',
      headers: {
        'content-type': 'application/json',
        'x-request-tag': 'one',
      },
    })
    expect(received[0].headers).not.toHaveProperty('authorization')
    expect(fields).toEqual({
      kind: 'request',
      request_id: REPLAY,
      replay_of: ORIGINAL,
      web_app: 'api',
      method: 'POST',
      path: '/orders?page=2',
      outcome: 'answered',
      status_code: 200,
      duration_ms: expect.any(Number),
      response: expect.objectContaining({
        status_code: 200,
        body: '{"ok":true}',
        body_encoding: 'text',
      }),
      file: expect.stringMatching(
        new RegExp(`^\\.serverless/dev/requests/api/\\d+-${REPLAY}\\.json$`),
      ),
      note: 'redacted_values_omitted',
      omitted: ['authorization', 'X-Amz-Signature'],
    })
    const saved = JSON.parse(
      fs.readFileSync(path.join(serviceDir, fields.file), 'utf8'),
    )
    expect(saved).toMatchObject({ source: 'replay', replay_of: ORIGINAL })
    const ends = records.filter((item) => item.type === 'request.end')
    expect(ends.map((end) => [end.request_id, end.source])).toEqual([
      [ORIGINAL, 'relay'],
      [REPLAY, 'replay'],
    ])
    expect(logger.text()).toContain(
      'Replaying 5e4d3c2b on api as 0f0e0d0c; no caller receives the response',
    )
  })

  test('a request whose body the file cut at 1 MiB is not replayed', async () => {
    const { received, replay, record } = await session()
    await record({
      body: Buffer.alloc(1024 * 1024 + 1, 'a'),
      path: '/upload',
      headers: {},
    })
    await expect(replay(ORIGINAL)).rejects.toMatchObject({
      reason: BODY_TRUNCATED,
      message: `The body of request ${ORIGINAL} was larger than 1 MiB and its file keeps only the first 1 MiB, so it is not replayed.`,
    })
    expect(received).toEqual([])
  })

  test('a web app that does not run here is refused before anything is sent', async () => {
    const { received, replay, record } = await session({ running: false })
    await record({ body: Buffer.from(''), path: '/', headers: {} })
    await expect(replay(ORIGINAL)).rejects.toMatchObject({
      reason: 'web_app_not_local',
      message: 'The web app api does not run on this machine in this session.',
    })
    expect(received).toEqual([])
  })

  test('a relayed POST that did not run keeps its body, and replays once the server runs', async () => {
    const { received, replay, dispatch, recorder, server, records } =
      await session()
    server.serving = false
    // As the relay does: it starts the record, dispatches the body it holds, and ends not_run.
    recorder.start({
      id: ORIGINAL,
      key: 'api',
      method: 'POST',
      path: '/orders',
    })
    await expect(
      dispatch({
        key: 'api',
        id: ORIGINAL,
        method: 'POST',
        path: '/orders',
        headers: { 'content-length': '14' },
        body: Buffer.from('{"item":"tea"}'),
        source: 'relay',
      }),
    ).rejects.toMatchObject({ notRun: true })
    recorder.end({
      id: ORIGINAL,
      key: 'api',
      outcome: 'not_run',
      status: null,
      bytes: 0,
    })
    expect(records.at(-1)).toMatchObject({
      outcome: 'not_run',
      status_code: null,
    })
    server.serving = true
    const fields = await replay(ORIGINAL)
    expect(fields).toMatchObject({ outcome: 'answered', status_code: 200 })
    expect(received).toEqual([
      expect.objectContaining({ method: 'POST', body: '{"item":"tea"}' }),
    ])
  })

  test('a local POST sent while the server was down has no known body, and is not replayed', async () => {
    const { serviceDir, received, replay, dispatch, server, records } =
      await session()
    server.serving = false
    const response = await dispatch({
      key: 'api',
      id: ORIGINAL,
      method: 'POST',
      path: '/orders',
      headers: { 'content-length': '14' },
      body: Readable.from([Buffer.from('{"item":"tea"}')]),
      source: 'local',
    })
    expect(response.status).toBe(503)
    const end = records.find((record) => record.type === 'request.end')
    const saved = JSON.parse(
      fs.readFileSync(path.join(serviceDir, end.file), 'utf8'),
    )
    expect(saved).toMatchObject({ outcome: 'not_run', status_code: null })
    expect(saved.request).toMatchObject({
      body: null,
      body_bytes: null,
      body_captured: false,
    })
    server.serving = true
    await expect(replay(ORIGINAL)).rejects.toMatchObject({
      reason: 'request_body_not_captured',
    })
    expect(received).toEqual([])
  })

  test('an unknown id is invocation_not_found, as for invocations', async () => {
    const { replay } = await session()
    await expect(replay('ffffffff-0000')).rejects.toMatchObject({
      reason: 'invocation_not_found',
    })
  })
})
