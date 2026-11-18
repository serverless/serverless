import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  HANDLED_WAIT_MS,
  LOCAL_LOG_HEADING,
  findHandledInvocation,
  findHandledRequest,
  handledLine,
  localLogLines,
  requestIdOf,
} from '../../../../../../../lib/plugins/aws/dev/state/handled.js'
import { manualClock } from '../relay/manual-clock.js'

const REQUEST = '3f2a9c1e-7b1d-4c55-9a51-0d2e3f4a5b6c'
const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

/** A service directory with this directory's session running `createOrder` in mode dev. */
const service = ({ stage = 'dev', modes = { createOrder: 'dev' } } = {}) => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(serviceDir)
  const devDir = path.join(serviceDir, '.serverless', 'dev')
  fs.mkdirSync(devDir, { recursive: true })
  fs.writeFileSync(
    path.join(devDir, 'session.json'),
    JSON.stringify({
      v: 1,
      session_id: 's_3f2a9c1e0b4d',
      pid: process.pid,
      state: 'on',
      service: 'orders',
      stage,
      region: 'us-east-1',
      owner: 'ana@laptop',
      selection: { only: [], skip: [] },
      detached: false,
      idle_timeout_s: null,
      started_at: '2026-10-05T10:40:02.113Z',
      ready_at: '2026-10-05T10:40:09.000Z',
      cli_version: '4.44.0',
      events_file: 'session.ndjson',
      log_file: null,
      control: { url: 'http://127.0.0.1:53121', token_file: 'control.token' },
    }),
    { mode: 0o600 },
  )
  const records = [
    { type: 'session.starting', service: 'orders', stage, region: 'us-east-1' },
    ...Object.entries(modes).map(([fn, mode]) => ({
      type: 'function.mode',
      function: fn,
      mode,
      ...(mode === 'dev'
        ? {}
        : { reason: 'not_selected', why: 'not selected' }),
    })),
  ].map((record, index) => ({
    v: 1,
    seq: index + 1,
    ts: '2026-10-05T10:40:03.000Z',
    session_id: 's_3f2a9c1e0b4d',
    ...record,
  }))
  fs.writeFileSync(
    path.join(devDir, 'session.ndjson'),
    records.map((r) => JSON.stringify(r)).join('\n') + '\n',
  )
  return serviceDir
}

/** The invocation file the session writes for REQUEST (Contracts → Invocation file). */
const writeInvocation = (
  serviceDir,
  { lines = ['started', 'done'], truncated = false } = {},
) => {
  const dir = path.join(
    serviceDir,
    '.serverless',
    'dev',
    'invocations',
    'createOrder',
  )
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `1759661067-${REQUEST}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      request_id: REQUEST,
      function: 'createOrder',
      source: 'caller',
      label: 'direct invoke',
      started_at: '2026-10-05T10:41:07.512Z',
      duration_ms: 38,
      init_ms: null,
      deployed_timeout_s: 6,
      outcome: 'ok',
      status_code: null,
      caller_received: null,
      error: null,
      logs: { lines, truncated },
      event: {},
      event_truncated: false,
      event_bytes: 2,
      response: { ok: true },
      response_truncated: false,
      response_bytes: 11,
      context: {
        function_name: 'orders-dev-createOrder',
        memory_mb: 1024,
        deadline_ms: Date.parse('2026-10-05T10:41:10.512Z'),
      },
      redacted: [],
    }),
  )
  return path.relative(serviceDir, file)
}

const ask = (serviceDir, extra = {}) => ({
  serviceDir,
  service: 'orders',
  stage: 'dev',
  region: 'us-east-1',
  functionKey: 'createOrder',
  requestId: REQUEST,
  ...extra,
})

describe('the request id of an Invoke response', () => {
  test('is read from the AWS SDK v3 metadata', () => {
    expect(
      requestIdOf({
        Payload: new Uint8Array(),
        $metadata: { requestId: REQUEST },
      }),
    ).toBe(REQUEST)
  })

  test('is read from the AWS SDK v2 response, which the SDK attaches as a hidden property', () => {
    const reply = Object.defineProperty(
      { Payload: Buffer.from('{}') },
      '$response',
      {
        value: { requestId: REQUEST },
      },
    )
    expect(Object.keys(reply)).toEqual(['Payload'])
    expect(requestIdOf(reply)).toBe(REQUEST)
  })

  test('is undefined when neither carries one', () => {
    expect(requestIdOf({ Payload: Buffer.from('{}') })).toBeUndefined()
    expect(requestIdOf(undefined)).toBeUndefined()
    expect(requestIdOf({ $metadata: { requestId: '' } })).toBeUndefined()
  })
})

describe('findHandledInvocation', () => {
  test('finds the file of a call the session ran here', async () => {
    const serviceDir = service()
    const file = writeInvocation(serviceDir)
    const clock = manualClock()
    const found = await findHandledInvocation(
      ask(serviceDir, { timers: clock.timers }),
    )
    expect(found.file.split(path.sep).join('/')).toBe(
      file.split(path.sep).join('/'),
    )
    expect(found.record.request_id).toBe(REQUEST)
    expect(clock.live()).toBe(0)
  })

  test('waits for a file the relay writes just after the response', async () => {
    const serviceDir = service()
    const clock = manualClock()
    const pending = findHandledInvocation(
      ask(serviceDir, { timers: clock.timers }),
    )
    await clock.advance(300)
    writeInvocation(serviceDir)
    await clock.advance(100)
    expect((await pending).record.request_id).toBe(REQUEST)
    expect(clock.live()).toBe(0)
  })

  test('gives up after two seconds and leaves no timer', async () => {
    const serviceDir = service()
    const clock = manualClock()
    const pending = findHandledInvocation(
      ask(serviceDir, { timers: clock.timers }),
    )
    await clock.advance(HANDLED_WAIT_MS)
    expect(await pending).toBeNull()
    expect(clock.live()).toBe(0)
  })

  test('a call of $LATEST is still matched', async () => {
    const serviceDir = service()
    writeInvocation(serviceDir)
    const clock = manualClock()
    const found = await findHandledInvocation(
      ask(serviceDir, { timers: clock.timers, qualifier: '$LATEST' }),
    )
    expect(found.record.request_id).toBe(REQUEST)
  })

  /** Gives the session file another session id: the event log is then an earlier session's. */
  const otherSession = (dir) => {
    const file = path.join(dir, '.serverless', 'dev', 'session.json')
    const record = JSON.parse(fs.readFileSync(file, 'utf8'))
    fs.writeFileSync(
      file,
      JSON.stringify({ ...record, session_id: 's_9c1e0b4d3f2a' }),
    )
  }

  test.each([
    [
      'no session here',
      (dir) => fs.rmSync(path.join(dir, '.serverless'), { recursive: true }),
      {},
    ],
    ['a session of another stage', () => {}, { stage: 'prod-like' }],
    ['a session of another region', () => {}, { region: 'eu-west-1' }],
    ['a session of another service', () => {}, { service: 'billing' }],
    ['a session whose process is gone', () => {}, { isAlive: () => false }],
    ['records of an earlier session only', otherSession, {}],
    [
      'a function the session runs on the deployed code',
      () => {},
      { functionKey: 'report' },
    ],
    [
      'an asynchronous call (--type Event)',
      () => {},
      { invocationType: 'Event' },
    ],
    [
      'a call of a version or alias (--qualifier)',
      () => {},
      { qualifier: 'live' },
    ],
    ['no request id', () => {}, { requestId: undefined }],
  ])('%s: nothing, at once', async (_name, change, extra) => {
    const serviceDir = service({
      modes: { createOrder: 'dev', report: 'deployed' },
    })
    writeInvocation(serviceDir)
    change(serviceDir)
    const clock = manualClock()
    expect(
      await findHandledInvocation(
        ask(serviceDir, { timers: clock.timers, ...extra }),
      ),
    ).toBeNull()
    expect(clock.timeouts()).toEqual([])
  })
})

describe('the lines invoke prints', () => {
  test('the handled line names the short request id and the file', () => {
    expect(
      handledLine({
        requestId: REQUEST,
        file: '.serverless/dev/invocations/createOrder/1759661067-x.json',
      }),
    ).toBe(
      'Dev Mode: handled by your working copy · request 3f2a9c1e · .serverless/dev/invocations/createOrder/1759661067-x.json',
    )
  })

  test('the local log lines follow their heading, and say when lines were not kept', () => {
    expect(LOCAL_LOG_HEADING).toBe('Dev Mode: log lines from your working copy')
    expect(
      localLogLines({ logs: { lines: ['a', 'b'], truncated: false } }),
    ).toEqual(['a', 'b'])
    expect(localLogLines({ logs: { lines: ['a'], truncated: true } })).toEqual([
      'a',
      '(more log lines than Dev Mode keeps)',
    ])
    expect(localLogLines({ logs: { lines: [], truncated: false } })).toEqual([
      '(no log lines)',
    ])
    expect(localLogLines({})).toEqual(['(no log lines)'])
  })
})

describe('findHandledRequest', () => {
  /** This directory's session running the web app `site` in `mode`, with `ends` request.end records. */
  const webService = ({ mode = 'dev', ends = [] } = {}) => {
    const serviceDir = service({ modes: {} })
    const file = path.join(serviceDir, '.serverless', 'dev', 'session.ndjson')
    const extra = [
      { type: 'web_app.mode', web_app: 'site', mode },
      ...ends.map((end) => ({ type: 'request.end', web_app: 'site', ...end })),
    ].map((record, index) => ({
      v: 1,
      seq: 10 + index,
      session_id: 's_3f2a9c1e0b4d',
      ts: '2026-10-05T10:41:00.000Z',
      ...record,
    }))
    fs.appendFileSync(
      file,
      extra.map((record) => JSON.stringify(record)).join('\n') + '\n',
    )
    return serviceDir
  }
  const find = (serviceDir, over = {}) =>
    findHandledRequest({
      serviceDir,
      service: 'orders',
      stage: 'dev',
      region: 'us-east-1',
      webApp: 'site',
      method: 'get',
      path: '/orders?X-Amz-Signature=abc',
      sentAt: Date.parse('2026-10-05T10:40:59.000Z'),
      waitMs: 0,
      ...over,
    })
  const END = {
    request_id: 'c1d2e3f4-0000-4000-8000-000000000001',
    source: 'relay',
    outcome: 'answered',
    status_code: 200,
    method: 'GET',
    path: '/orders?X-Amz-Signature=[redacted]',
    file: '.serverless/dev/requests/site/1790000000-c1d2e3f4.json',
  }

  test('finds the relayed request the call made: same web app, method and path, ended after it was sent', async () => {
    const serviceDir = webService({
      ends: [
        {
          ...END,
          request_id: 'aaaaaaaa-0000-4000-8000-000000000001',
          method: 'POST',
        },
        {
          ...END,
          request_id: 'bbbbbbbb-0000-4000-8000-000000000002',
          source: 'local',
        },
        END,
      ],
    })
    expect(await find(serviceDir)).toEqual({
      requestId: END.request_id,
      file: END.file,
    })
  })

  test('nothing for a request that ended before the call, a web app not in mode dev, or no session', async () => {
    expect(
      await find(webService({ ends: [END] }), {
        sentAt: Date.parse('2026-10-05T10:41:01.000Z'),
      }),
    ).toBeNull()
    expect(await find(webService({ mode: 'local', ends: [END] }))).toBeNull()
    expect(
      await find(webService({ ends: [END] }), { stage: 'prod' }),
    ).toBeNull()
  })

  test('a request the deployed code answered, or that failed before the local server answered, is not handled here', async () => {
    const notRun = {
      ...END,
      request_id: 'dddddddd-0000-4000-8000-000000000004',
      outcome: 'not_run',
      status_code: null,
    }
    const failedEarly = {
      ...END,
      request_id: 'eeeeeeee-0000-4000-8000-000000000005',
      outcome: 'failed',
      status_code: null,
    }
    expect(await find(webService({ ends: [notRun] }))).toBeNull()
    expect(await find(webService({ ends: [failedEarly] }))).toBeNull()
    // The newest answered one is still found past them.
    expect(await find(webService({ ends: [END, notRun] }))).toEqual({
      requestId: END.request_id,
      file: END.file,
    })
    // A response that broke after the local server answered was handled here.
    const brokeLate = { ...END, outcome: 'failed', status_code: 200 }
    expect(await find(webService({ ends: [brokeLate] }))).toEqual({
      requestId: END.request_id,
      file: END.file,
    })
  })

  test('waits for the record up to its limit', async () => {
    const clock = manualClock(0)
    const serviceDir = webService()
    const found = find(serviceDir, {
      waitMs: HANDLED_WAIT_MS,
      timers: clock.timers,
    })
    await clock.advance(100)
    fs.appendFileSync(
      path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
      JSON.stringify({
        v: 1,
        seq: 99,
        session_id: 's_3f2a9c1e0b4d',
        ts: '2026-10-05T10:41:00.000Z',
        type: 'request.end',
        web_app: 'site',
        ...END,
      }) + '\n',
    )
    await clock.advance(100)
    expect(await found).toEqual({ requestId: END.request_id, file: END.file })
  })
})
