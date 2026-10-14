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
})
