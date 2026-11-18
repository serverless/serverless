import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  DEFAULT_LIMIT,
  renderRequests,
  runDevRequests,
} from '../../../../../../../lib/plugins/aws/dev/commands/requests.js'
import { exitCodeOf } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import {
  FILES,
  fnDirOf,
  invocationFileName,
  requestFileName,
  webAppDirOf,
} from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

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
const BASE = Date.parse('2026-10-05T10:00:00.000Z')
/** Invocation `n` of `fn`, `n` seconds after BASE, as the recorder writes it. */
const writeInvocation = (service, fn, n, fields = {}) => {
  const requestId = `${String(n).padStart(8, '0')}-0000-4000-8000-00000000000a`
  const startedAtMs = BASE + n * 1000
  const file = path.join(
    service,
    '.serverless',
    'dev',
    FILES.invocations,
    fnDirOf(fn),
    invocationFileName({ startedAtMs, requestId }),
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      request_id: requestId,
      function: fn,
      source: 'caller',
      label: 'direct invoke',
      started_at: new Date(startedAtMs).toISOString(),
      duration_ms: 10 + n,
      init_ms: null,
      deployed_timeout_s: 6,
      outcome: 'ok',
      status_code: null,
      event: {},
      response: null,
      redacted: [],
      ...fields,
    }),
  )
  return requestId
}
const noSession = async () => null
/** Web request `n` to `webApp`, `n` seconds after BASE, as the request recorder writes it. */
const writeWebRequest = (service, webApp, n, fields = {}) => {
  const requestId = `${String(n).padStart(8, '0')}-0000-4000-8000-00000000000b`
  const startedAtMs = BASE + n * 1000
  const file = path.join(
    service,
    '.serverless',
    'dev',
    FILES.requests,
    webAppDirOf(webApp),
    requestFileName({ startedAtMs, requestId }),
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      request_id: requestId,
      web_app: webApp,
      stage: 'alice',
      source: 'relay',
      started_at: new Date(startedAtMs).toISOString(),
      duration_ms: 20 + n,
      outcome: 'answered',
      status_code: 200,
      reason: null,
      request: { method: 'GET', path: '/orders?page=2', headers: {} },
      response: null,
      redacted: [],
      ...fields,
    }),
  )
  return requestId
}

describe('dev requests', () => {
  test(`lists the newest first, ${DEFAULT_LIMIT} by default, with each file`, async () => {
    const service = serviceDir()
    for (let n = 1; n <= 25; n += 1)
      writeInvocation(service, n % 2 ? 'createOrder' : 'listOrders', n)
    const { result } = await runDevRequests({
      serviceDir: service,
      options: {},
      deps: { connect: noSession },
    })
    expect(exitCodeOf(result)).toBe(0)
    expect(result.requests).toHaveLength(DEFAULT_LIMIT)
    expect(result.requests[0]).toMatchObject({
      function: 'createOrder',
      request_id: '00000025-0000-4000-8000-00000000000a',
      outcome: 'ok',
      duration_ms: 35,
    })
    expect(result.requests[0].file).toMatch(
      /^\.serverless[\\/]dev[\\/]invocations[\\/]createOrder[\\/]/,
    )
    const times = result.requests.map((request) => Date.parse(request.ts))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  test('requests lists web requests and invocations', async () => {
    const service = serviceDir()
    writeInvocation(service, 'createOrder', 1)
    const webId = writeWebRequest(service, 'api', 2)
    writeWebRequest(service, 'admin', 3, {
      outcome: 'not_run',
      status_code: null,
      source: 'local',
    })
    const { result, human } = await runDevRequests({
      serviceDir: service,
      options: {},
      deps: { connect: noSession },
    })
    expect(exitCodeOf(result)).toBe(0)
    expect(result.requests.map((row) => row.kind)).toEqual([
      'request',
      'request',
      'invocation',
    ])
    expect(result.requests[1]).toEqual({
      ts: new Date(BASE + 2000).toISOString(),
      kind: 'request',
      web_app: 'api',
      stage: 'alice',
      request_id: webId,
      source: 'relay',
      method: 'GET',
      path: '/orders?page=2',
      outcome: 'answered',
      status_code: 200,
      duration_ms: 22,
      file: `.serverless/dev/requests/api/${requestFileName({ startedAtMs: BASE + 2000, requestId: webId })}`,
    })
    expect(result.requests[0]).toMatchObject({
      web_app: 'admin',
      outcome: 'not_run',
      status_code: null,
    })
    expect(result.requests[2]).toMatchObject({
      kind: 'invocation',
      function: 'createOrder',
    })
    expect(human.split('\n')[0]).toMatch(/^When +Function or web app +Stage/)
    expect(human).toContain('api GET /orders?page=2')
  })

  test('--web-app lists only its requests, --function only its invocations, both both', async () => {
    const service = serviceDir()
    writeInvocation(service, 'createOrder', 1)
    writeWebRequest(service, 'api', 2)
    writeWebRequest(service, 'admin', 3)
    const kindsOf = async (options) =>
      (
        await runDevRequests({
          serviceDir: service,
          options,
          deps: { connect: noSession },
        })
      ).result.requests.map((row) => row.web_app ?? row.function)
    expect(await kindsOf({ 'web-app': ['api'] })).toEqual(['api'])
    expect(await kindsOf({ function: ['createOrder'] })).toEqual([
      'createOrder',
    ])
    expect(
      await kindsOf({ function: ['createOrder'], 'web-app': ['admin'] }),
    ).toEqual(['admin', 'createOrder'])
    const { human } = await runDevRequests({
      serviceDir: service,
      options: { 'web-app': ['shop'] },
      deps: { connect: noSession },
    })
    expect(human).toBe(
      'No requests to shop are recorded in .serverless/dev/requests yet.',
    )
  })

  test('each request names the stage it ran on; a file without one has none', async () => {
    const service = serviceDir()
    writeInvocation(service, 'createOrder', 1)
    writeInvocation(service, 'createOrder', 2, { stage: 'alice' })
    writeInvocation(service, 'createOrder', 3, { stage: 'bob' })
    const { result } = await runDevRequests({
      serviceDir: service,
      options: {},
      deps: { connect: noSession },
    })
    expect(result.requests.map((request) => request.stage)).toEqual([
      'bob',
      'alice',
      null,
    ])
  })

  test('--function and --limit narrow the list', async () => {
    const service = serviceDir()
    for (let n = 1; n <= 6; n += 1)
      writeInvocation(service, n % 2 ? 'createOrder' : 'listOrders', n)
    const { result } = await runDevRequests({
      serviceDir: service,
      options: { function: ['listOrders'], limit: '2' },
      deps: { connect: noSession },
    })
    expect(result.requests.map((request) => request.request_id)).toEqual([
      '00000006-0000-4000-8000-00000000000a',
      '00000004-0000-4000-8000-00000000000a',
    ])
  })

  test.each(['0', '501', 'ten', '1.5'])(
    '--limit %p is invalid_option_value',
    async (limit) => {
      const { result, human } = await runDevRequests({
        serviceDir: serviceDir(),
        options: { limit },
        deps: { connect: noSession },
      })
      expect(result).toMatchObject({
        status: 'error',
        reason: 'invalid_option_value',
      })
      expect(human).toBe('Option "--limit" takes a whole number from 1 to 500.')
      expect(exitCodeOf(result)).toBe(1)
    },
  )

  test('an unexpected error is an error result with exit 1, never ok', async () => {
    const { result } = await runDevRequests({
      serviceDir: serviceDir(),
      options: {},
      deps: {
        connect: noSession,
        list: () => {
          throw new Error('the disk is gone')
        },
      },
    })
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'the disk is gone',
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('no files is an empty list, and a line that says so', async () => {
    const { result, human } = await runDevRequests({
      serviceDir: serviceDir(),
      options: { function: ['createOrder'] },
      deps: { connect: noSession },
    })
    expect(result).toMatchObject({ status: 'ok', requests: [] })
    expect(human).toBe(
      'No invocations of createOrder are recorded in .serverless/dev/invocations yet.',
    )
  })

  test('asking counts as activity of a running session, and needs none', async () => {
    const service = serviceDir()
    writeInvocation(service, 'createOrder', 1)
    const touch = jest.fn(async () => ({ status: 204, body: null }))
    await runDevRequests({
      serviceDir: service,
      options: {},
      deps: { connect: async () => ({ touch }) },
    })
    expect(touch).toHaveBeenCalledTimes(1)
    const failing = await runDevRequests({
      serviceDir: service,
      options: {},
      deps: {
        connect: async () => ({
          touch: async () => {
            throw new Error('gone')
          },
        }),
      },
    })
    expect(failing.result.status).toBe('ok')
  })

  test('the table a person reads', () => {
    expect(
      renderRequests({
        nowMs: Date.parse('2026-10-05T10:42:00.000Z'),
        requests: [
          {
            ts: '2026-10-05T10:41:07.512Z',
            function: 'createOrder',
            stage: 'alice',
            request_id: '3f2a9c1e-0000-4000-8000-00000000000b',
            outcome: 'error',
            duration_ms: 38,
            status_code: 502,
            file: '.serverless/dev/invocations/createOrder/1759661067-3f2a9c1e.json',
          },
          {
            ts: '2026-10-05T10:30:00.000Z',
            function: 'list',
            stage: null,
            request_id: '77e0b3aa-0000-4000-8000-00000000000c',
            outcome: 'ok',
            duration_ms: 2,
            file: '.serverless/dev/invocations/list/1759660200-77e0b3aa.json',
          },
        ],
      }),
    ).toBe(
      [
        'When                    Function     Stage  Request   Outcome  Status  Duration  File',
        'less than a minute ago  createOrder  alice  3f2a9c1e  error    502     38 ms     .serverless/dev/invocations/createOrder/1759661067-3f2a9c1e.json',
        '12 min ago              list                77e0b3aa  ok               2 ms      .serverless/dev/invocations/list/1759660200-77e0b3aa.json',
      ].join('\n'),
    )
  })

  describe('within the terminal width', () => {
    const nowMs = Date.parse('2026-10-05T10:42:00.000Z')
    const requests = [
      {
        ts: '2026-10-05T10:41:07.512Z',
        kind: 'request',
        web_app: 'site',
        method: 'GET',
        path: '/_next/static/chunks/node_modules_next_dist_client_1wygxxh5rwq0t._.js',
        stage: 'alice',
        request_id: '3f2a9c1e-0000-4000-8000-00000000000b',
        outcome: 'answered',
        duration_ms: 518,
        status_code: 200,
        file: '.serverless/dev/requests/site/1759661067-3f2a9c1e-0000-4000-8000-00000000000b.json',
      },
      {
        ts: '2026-10-05T10:30:00.000Z',
        function: 'hello',
        stage: 'alice',
        request_id: '77e0b3aa-0000-4000-8000-00000000000c',
        outcome: 'ok',
        duration_ms: 2,
        file: '.serverless/dev/invocations/hello/1759660200-77e0b3aa.json',
      },
    ]
    const widest = (text) =>
      Math.max(...text.split('\n').map((line) => line.length))

    test('a terminal wide enough shows the whole table', () => {
      const whole = renderRequests({ requests, nowMs })
      expect(renderRequests({ requests, nowMs, width: 400 })).toBe(whole)
      expect(whole.split('\n')[0]).toMatch(/File$/)
    })

    test('the File column goes first: --json has it', () => {
      const text = renderRequests({ requests, nowMs, width: 140 })
      expect(widest(text)).toBeLessThan(140)
      expect(text).not.toContain('File')
      expect(text).not.toContain('.serverless/dev/')
      // The route is as long as without a terminal while it fits.
      const whole = renderRequests({ requests, nowMs }).split('\n')[1]
      const route = whole.match(/site GET \S+…/)[0]
      expect(text.split('\n')[1]).toContain(route)
    })

    test('then the name and route are cut, with an ellipsis', () => {
      const text = renderRequests({ requests, nowMs, width: 92 })
      expect(widest(text)).toBeLessThan(92)
      const [, site, hello] = text.split('\n')
      expect(site).toMatch(
        /^less than a minute ago {2}site GET \/_next\/\S*… {2}alice {2}3f2a9c1e {2}answered {2}200 +518 ms$/,
      )
      expect(hello).toMatch(
        /^12 min ago +hello +alice {2}77e0b3aa {2}ok +2 ms$/,
      )
    })

    test('a terminal too narrow for even that keeps the other columns whole', () => {
      const text = renderRequests({ requests, nowMs, width: 40 })
      for (const cell of ['3f2a9c1e', 'answered', '518 ms', 'alice']) {
        expect(text).toContain(cell)
      }
      expect(text.split('\n')[1]).toContain('site GET /_…')
    })

    test('dev requests fits its table to the terminal; its result is whole', async () => {
      const service = serviceDir()
      writeWebRequest(service, 'site', 1, {
        request: { method: 'GET', path: `/${'a'.repeat(120)}`, headers: {} },
      })
      const { result, human } = await runDevRequests({
        serviceDir: service,
        options: {},
        deps: { connect: noSession, width: () => 80 },
      })
      expect(widest(human)).toBeLessThan(80)
      expect(human).not.toContain('.serverless/dev/')
      expect(result.requests[0].path).toBe(`/${'a'.repeat(120)}`)
      expect(result.requests[0].file).toContain(
        '.serverless/dev/requests/site/',
      )
      // Without a terminal (a pipe, a log file) nothing is cut.
      const piped = await runDevRequests({
        serviceDir: service,
        options: {},
        deps: { connect: noSession, width: () => 0 },
      })
      expect(piped.human).toContain('.serverless/dev/requests/site/')
    })
  })
})
