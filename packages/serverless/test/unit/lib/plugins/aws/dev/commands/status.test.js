import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  runDevStatus,
  sessionStatusFields,
} from '../../../../../../../lib/plugins/aws/dev/commands/status.js'
import {
  jsonRequested,
  printResult,
} from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { endStatusOf } from '../../../../../../../lib/plugins/aws/dev/commands/session-end.js'
import { openEventLog } from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import { claimSession } from '../../../../../../../lib/plugins/aws/dev/state/session-file.js'
import { fakeLog, testSessionId } from '../attach/fakes.js'
import { runWithoutColor } from '../without-color.js'
import { runnable } from './runnable.js'

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
const devDir = (dir) => path.join(dir, '.serverless', 'dev')
const stdout = () => ({
  written: [],
  write(text) {
    this.written.push(text)
  },
})
/** Runs the command and prints its result as the finite-command helper of index.js does. */
const run = async (
  dir,
  { options = { json: true }, connect = async () => null, isAlive } = {},
) => {
  const out = stdout()
  const logger = fakeLog()
  const { result, human } = await runDevStatus({
    serviceDir: dir,
    options,
    deps: { connect, ...(isAlive && { isAlive }) },
  })
  const code = printResult({
    json: jsonRequested(options),
    result,
    human,
    logger,
    stdout: out,
  })
  return {
    code,
    result: out.written.length ? JSON.parse(out.written.join('')) : null,
    text: logger.text(),
    out,
  }
}
const RECORD = {
  v: 1,
  session_id: testSessionId(1),
  pid: 4123,
  state: 'on',
  service: 'orders',
  stage: 'dev',
  region: 'us-east-1',
  owner: 'ana@laptop',
  selection: { only: [], skip: ['report'] },
  detached: false,
  idle_timeout_s: null,
  started_at: '2026-10-05T10:40:02.113Z',
  ready_at: '2026-10-05T10:40:09.000Z',
  control: { url: 'http://127.0.0.1:1', token_file: 'control.token' },
}

describe('a running session', () => {
  test('a session without its record answers with what it knows', () => {
    expect(
      sessionStatusFields({
        record: null,
        rows: [{ function: 'api', mode: 'dev', notes: [] }],
      }),
    ).toEqual({
      state: undefined,
      invocations: { total: 0, errors: 0 },
      last_invocation: undefined,
      functions: [
        {
          name: 'api',
          mode: 'dev',
          reason: undefined,
          why: undefined,
          notes: undefined,
        },
      ],
      endpoints: [],
      cursor: undefined,
    })
  })

  test('answers with its fields, functions, invocations and endpoints', async () => {
    const lastTs = new Date(Date.now() - 12_000).toISOString()
    const fields = sessionStatusFields({
      record: RECORD,
      rows: [
        {
          function: 'createOrder',
          mode: 'dev',
          notes: [{ reason: 'vpc_egress_required', message: 'needs egress' }],
        },
        {
          function: 'report',
          mode: 'deployed',
          reason: 'not_selected',
          why: 'not selected (--skip-function)',
          notes: [],
        },
      ],
      recorder: {
        counts: () => ({ total: 3, errors: 1 }),
        lastInvocation: () => ({
          request_id: '3f2a9c1e-00',
          function: 'createOrder',
          outcome: 'error',
          ts: lastTs,
        }),
      },
      endpoints: [
        { method: 'POST', url: 'https://x/orders', function: 'createOrder' },
      ],
      // The endpoints `info` prints, labelled, which the session computed.
      endpointRows: {
        endpoints: [{ label: 'POST /orders', url: 'https://x/orders' }],
        mcp: [],
      },
      cursor: `${testSessionId(1)}:57`,
    })
    const { code, result, text } = await run(serviceDir(), {
      connect: async () => ({
        status: async () => ({ status: 200, body: fields }),
      }),
    })
    expect(code).toBe(0)
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      cursor: `${testSessionId(1)}:57`,
      state: 'on',
      session_id: testSessionId(1),
      pid: 4123,
      owner: 'ana@laptop',
      service: 'orders',
      stage: 'dev',
      region: 'us-east-1',
      detached: false,
      started_at: '2026-10-05T10:40:02.113Z',
      ready_at: '2026-10-05T10:40:09.000Z',
      invocations: { total: 3, errors: 1 },
      last_invocation: {
        request_id: '3f2a9c1e-00',
        function: 'createOrder',
        outcome: 'error',
        ts: lastTs,
      },
      functions: [
        { name: 'createOrder', mode: 'dev', notes: ['vpc_egress_required'] },
        {
          name: 'report',
          mode: 'deployed',
          reason: 'not_selected',
          why: 'not selected (--skip-function)',
        },
      ],
      endpoints: [
        { method: 'POST', url: 'https://x/orders', function: 'createOrder' },
      ],
    })
    expect(text).toContain(
      `Dev Mode on · session ${testSessionId(1)} · pid 4123 · stage dev · us-east-1`,
    )
    expect(text).toMatch(/report\s+deployed\s+not selected \(--skip-function\)/)
    // The last invocation's time is relative, as the s key says it.
    expect(text).toMatch(
      /3 invocations \(1 not ok\) · last: createOrder 3f2a9c1e error, \d+ (s|min|h|d) ago/,
    )
    // As the start-up lists them; the result above has the entries only.
    expect(text).toContain('endpoints:\n  POST /orders  https://x/orders')
  })

  test('status lists web_apps with url and local_url', async () => {
    const state = new Map([
      [
        'web',
        {
          mode: 'dev',
          port: 51001,
          localUrl: 'http://127.0.0.1:52001',
          credentials: 'relayed',
          serving: true,
          note: null,
        },
      ],
      [
        'admin',
        {
          mode: 'local',
          port: 51002,
          localUrl: 'http://127.0.0.1:52002',
          credentials: 'denied',
          serving: false,
          note: { reason: 'local_server_down', message: 'down' },
        },
      ],
    ])
    const fields = sessionStatusFields({
      record: RECORD,
      rows: [{ function: 'createOrder', mode: 'dev', notes: [] }],
      requestRecorder: {
        counts: () => ({ total: 3, failed: 1 }),
        lastRequest: () => ({
          request_id: 'c1d2e3f4-0000-4000-8000-000000000001',
          web_app: 'web',
          outcome: 'answered',
          ts: '2026-10-05T10:41:07.512Z',
        }),
      },
      webApps: {
        rows: [
          { webApp: 'web', mode: 'dev', notes: [] },
          { webApp: 'admin', mode: 'local', notes: [] },
          {
            webApp: 'docs',
            mode: 'skipped',
            reason: 'not_deployed',
            why: 'not deployed yet (run serverless deploy)',
            notes: [],
          },
        ],
        state,
        urlOf: (key) =>
          key === 'docs' ? undefined : `https://main-${key}.example`,
      },
      endpointRows: {
        endpoints: [],
        webAppUrls: [
          { name: 'web', url: 'https://main-web.example' },
          { name: 'web', url: 'https://www.example.com' },
          { name: 'admin', url: 'https://main-admin.example' },
        ],
        mcp: [],
      },
    })
    const { result, text } = await run(serviceDir(), {
      connect: async () => ({
        status: async () => ({ status: 200, body: fields }),
      }),
    })
    expect(result.web_apps).toEqual([
      {
        name: 'web',
        mode: 'dev',
        url: 'https://main-web.example',
        local_url: 'http://127.0.0.1:52001',
      },
      {
        name: 'admin',
        mode: 'local',
        why: 'on its local URL only (--local-only); its real URL serves the deployed code; its server on this machine is not listening on port 51002; requests run the deployed code until it is; runs without its role credentials: your AWS credentials may not call its endpoint sls-dev-local (lambda:InvokeWebFunctionEndpoint)',
        notes: ['local_server_down', 'no_role_credentials'],
        url: 'https://main-admin.example',
        local_url: 'http://127.0.0.1:52002',
      },
      {
        name: 'docs',
        mode: 'skipped',
        reason: 'not_deployed',
        why: 'not deployed yet (run serverless deploy)',
      },
    ])
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['functions', 'web_apps', 'endpoints']),
    )
    // The requests, as the invocations are counted.
    expect(result.requests).toEqual({ total: 3, failed: 1 })
    expect(result.last_request).toEqual({
      request_id: 'c1d2e3f4-0000-4000-8000-000000000001',
      web_app: 'web',
      outcome: 'answered',
      ts: '2026-10-05T10:41:07.512Z',
    })
    expect(text).toContain(
      '0 invocations\n3 web requests (1 not ok) · last: web c1d2e3f4 answered',
    )
    // The table lists them after the functions; web apps: lists the real URLs and the URL on this machine of those that run here.
    expect(text).toMatch(/web \(web app\)\s+dev/)
    expect(text).toMatch(/docs \(web app\)\s+skipped\s+not deployed yet/)
    expect(text).toContain(
      [
        'web apps:',
        '  web    https://main-web.example',
        '         https://www.example.com',
        '         http://127.0.0.1:52001',
        '  admin  http://127.0.0.1:52002  (local only)',
      ].join('\n'),
    )
    expect(text).not.toContain('endpoints:')
  })

  test('a service without web apps has no web_apps in its status', () => {
    const fields = sessionStatusFields({
      record: RECORD,
      rows: [{ function: 'api', mode: 'dev', notes: [] }],
      webApps: { rows: [], state: new Map() },
    })
    expect(fields).not.toHaveProperty('web_apps')
    expect(fields).not.toHaveProperty('requests')
    expect(fields).not.toHaveProperty('last_request')
  })

  test('a session of web apps alone counts requests, with no invocation line; none yet is zero', async () => {
    const fields = sessionStatusFields({
      record: RECORD,
      rows: [],
      webApps: {
        rows: [{ webApp: 'web', mode: 'dev', notes: [] }],
        state: new Map(),
      },
    })
    expect(fields.requests).toEqual({ total: 0, failed: 0 })
    expect(fields.last_request).toBeUndefined()
    const { text } = await run(serviceDir(), {
      options: {},
      connect: async () => ({
        status: async () => ({ status: 200, body: fields }),
      }),
    })
    expect(text).toContain('0 web requests')
    expect(text).not.toContain('invocation')
  })

  test('lists MCP servers after the HTTP endpoints, as deploy and info print them', async () => {
    const endpoints = [
      { method: 'POST', url: 'https://x/orders', function: 'createOrder' },
      { method: 'ANY', url: 'https://x/crm/mcp', function: 'crm', mcp: true },
    ]
    const fields = sessionStatusFields({
      record: RECORD,
      endpoints,
      endpointRows: {
        endpoints: [{ label: 'POST /orders', url: 'https://x/orders' }],
        mcp: [{ name: 'crm', url: 'https://x/crm/mcp' }],
      },
    })
    const connect = async () => ({
      status: async () => ({ status: 200, body: fields }),
    })
    const { result } = await run(serviceDir(), { connect })
    expect(result.endpoints).toEqual(endpoints)
    expect(Object.keys(result)).not.toContain('endpoint_text')
    const { text } = await run(serviceDir(), { options: {}, connect })
    expect(text).toContain(
      'endpoints:\n  POST /orders  https://x/orders\nmcp:\n  crm  https://x/crm/mcp',
    )
  })

  // A session of an earlier CLI version answers `endpoint_text` alone, the lines `deploy` and
  // `info` print, in the shape d86fb3f's session wrote: no `endpoint_rows`.
  const olderSession = ({ webApps, endpointText }) => {
    const fields = sessionStatusFields({
      record: RECORD,
      webApps: {
        rows: webApps.map(({ name, mode }) => ({
          webApp: name,
          mode,
          notes: [],
        })),
        state: new Map(
          webApps.map(({ name, mode, localUrl }) => [
            name,
            { mode, port: 51001, localUrl, serving: true, note: null },
          ]),
        ),
        urlOf: (key) => webApps.find((webApp) => webApp.name === key)?.url,
      },
    })
    return async () => ({
      status: async () => ({
        status: 200,
        body: { ...fields, endpoint_text: endpointText },
      }),
    })
  }

  test('a session of an earlier CLI version: its endpoint lines are listed, each web app once, under web apps:', async () => {
    const connect = olderSession({
      webApps: [
        {
          name: 'site',
          mode: 'dev',
          localUrl: 'http://localhost:52001',
          url: 'https://main-site.example',
        },
        {
          name: 'admin',
          mode: 'local',
          localUrl: 'http://localhost:52002',
          url: 'https://main-admin.example',
        },
      ],
      endpointText: {
        endpoints: [
          'GET - https://x/hello',
          'site: https://main-site.example',
          'site: https://www.example.com',
          'admin: https://main-admin.example',
        ],
        mcp: ['crm → https://x/crm/mcp'],
      },
    })
    const { text } = await run(serviceDir(), { options: {}, connect })
    expect(text).toContain(
      [
        'endpoints:',
        '  GET - https://x/hello',
        'web apps:',
        '  site   https://main-site.example',
        '         https://www.example.com',
        '         http://localhost:52001',
        '  admin  http://localhost:52002  (local only)',
        'mcp:',
        '  crm  https://x/crm/mcp',
      ].join('\n'),
    )
    expect(text.match(/main-site\.example/g)).toHaveLength(1)
    expect(text).not.toContain('main-admin.example')
  })

  test('a session of an earlier CLI version with a lone web app: its bare URL is listed under web apps: only', async () => {
    const connect = olderSession({
      webApps: [
        {
          name: 'site',
          mode: 'dev',
          localUrl: 'http://localhost:52001',
          url: 'https://main-site.example',
        },
      ],
      endpointText: { endpoints: ['https://main-site.example'], mcp: [] },
    })
    const { text } = await run(serviceDir(), { options: {}, connect })
    expect(text).toContain(
      'web apps:\n  site  https://main-site.example\n        http://localhost:52001',
    )
    expect(text).not.toContain('endpoints:')
  })

  test('both endpoint fields stay out of --json', async () => {
    const fields = sessionStatusFields({
      record: RECORD,
      endpointText: { endpoints: ['GET - https://x/hello'], mcp: [] },
      endpointRows: {
        endpoints: [{ label: 'GET /hello', url: 'https://x/hello' }],
        webAppUrls: [],
        mcp: [],
      },
    })
    const { result } = await run(serviceDir(), {
      connect: async () => ({
        status: async () => ({ status: 200, body: fields }),
      }),
    })
    expect(Object.keys(result)).not.toContain('endpoint_text')
    expect(Object.keys(result)).not.toContain('endpoint_rows')
  })

  test('lists every endpoint, beyond the ten the start-up names', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({
      label: `GET /${i}`,
      url: `https://x/${i}`,
    }))
    const fields = sessionStatusFields({
      record: RECORD,
      endpointRows: { endpoints: lines, mcp: [] },
    })
    const connect = async () => ({
      status: async () => ({ status: 200, body: fields }),
    })
    const { text } = await run(serviceDir(), { options: {}, connect })
    expect(text).toContain('  GET /11  https://x/11')
    expect(text).not.toContain('more')
  })

  test('without --json nothing goes to stdout', async () => {
    const { out, code } = await run(serviceDir(), { options: {} })
    expect(out.written).toEqual([])
    expect(code).toBe(0)
  })

  test('a failure becomes an error result, exit 1', async () => {
    const { code, result } = await run(serviceDir(), {
      connect: async () => {
        throw new Error('boom')
      },
    })
    expect(code).toBe(1)
    expect(result).toEqual({
      v: 1,
      status: 'error',
      reason: 'error',
      message: 'boom',
    })
  })
})

describe('no session answers', () => {
  test('nothing ever ran here: off, exit 0', async () => {
    const { code, result, text } = await run(serviceDir())
    expect(code).toBe(0)
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      message: 'Dev Mode is off here.',
      state: 'off',
      invocations: { total: 0, errors: 0 },
      functions: [],
      endpoints: [],
    })
    expect(text).toBe('Dev Mode is off here.')
  })

  test('the last session ended: off, with its last cursor', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.starting', {})
    log.emit('session.ended', { exit_code: 0 })
    log.close()
    const { result } = await run(dir)
    expect(result).toMatchObject({
      state: 'off',
      session_id: testSessionId(1),
      cursor: `${testSessionId(1)}:2`,
    })
    expect(result.next).toBeUndefined()
  })

  test('the last start failed: failed, with its reason', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.starting', {})
    log.emit('session.failed', {
      reason: 'permission_denied',
      message: 'iot:Connect was denied',
      exit_code: 1,
    })
    log.emit('session.ended', { exit_code: 1 })
    log.close()
    const { code, result } = await run(dir)
    expect(code).toBe(0)
    expect(result).toMatchObject({
      state: 'failed',
      message:
        'Dev Mode is off here: the last start failed (permission_denied): iot:Connect was denied',
    })
  })

  test('the last session ended without restoring every function: off, with the restore dev stop and dev wait give', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.starting', { stage: 'alice', region: 'eu-west-1' })
    log.emit('session.ready', {})
    log.emit('session.ended', {
      exit_code: 3,
      restore: { restored: 1, unchanged: 0, skipped: 0, missing: 0, failed: 2 },
    })
    log.close()
    const { code, result, text } = await run(dir)
    expect(code).toBe(0)
    expect(result).toMatchObject({
      state: 'off',
      message:
        'Dev Mode is off here. The last session could not restore 2 functions.',
      next: [
        {
          command: 'serverless dev restore --stage alice --region eu-west-1',
          when: expect.any(String),
        },
      ],
    })
    // In a terminal, the restore is printed too, as `dev stop` and `dev wait` print it.
    expect(text).toBe(
      'Dev Mode is off here. The last session could not restore 2 functions.\n' +
        'Run "serverless dev restore --stage alice --region eu-west-1" to restore any function it left in Dev Mode.',
    )
    const stopped = endStatusOf(
      { type: 'session.ended', exit_code: 3 },
      { restore: { failed: 2 } },
      { stage: 'alice', region: 'eu-west-1' },
    )
    expect(result.next).toEqual(stopped.next)
  })

  test('the last start failed and left a function attached: failed, with the restore', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.starting', { stage: 'alice', region: 'eu-west-1' })
    log.emit('session.failed', {
      reason: 'error',
      message: 'the relay stopped',
      exit_code: 1,
    })
    log.emit('session.ended', {
      exit_code: 3,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 1 },
    })
    log.close()
    const { result, text } = await run(dir)
    expect(text).toBe(
      'Dev Mode is off here: the last start failed (error): the relay stopped. It could not restore 1 function.\n' +
        'Run "serverless dev restore --stage alice --region eu-west-1" to restore any function it left in Dev Mode.',
    )
    expect(result).toMatchObject({
      state: 'failed',
      message:
        'Dev Mode is off here: the last start failed (error): the relay stopped. It could not restore 1 function.',
      next: [
        {
          command: 'serverless dev restore --stage alice --region eu-west-1',
        },
      ],
    })
  })

  test('a session of web apps names them where it could not restore or ended without restoring', async () => {
    const killed = serviceDir()
    let log = openEventLog({
      dir: devDir(killed),
      sessionId: testSessionId(1),
    })
    log.emit('session.starting', { stage: 'alice', region: 'eu-west-1' })
    log.emit('web_app.mode', { web_app: 'web', mode: 'dev' })
    log.emit('session.ready', {})
    log.close()
    expect((await run(killed)).result.message).toBe(
      'Dev Mode is off here. The last session ended without restoring its web apps.',
    )
    const ended = serviceDir()
    log = openEventLog({ dir: devDir(ended), sessionId: testSessionId(1) })
    log.emit('session.starting', { stage: 'alice', region: 'eu-west-1' })
    log.emit('session.ready', {})
    log.emit('session.ended', {
      exit_code: 3,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 2 },
      web_apps: {
        restored: 0,
        unchanged: 0,
        skipped: 0,
        missing: 0,
        failed: 1,
      },
    })
    log.close()
    expect((await run(ended)).result.message).toBe(
      'Dev Mode is off here. The last session could not restore 1 function and 1 web app.',
    )
  })

  test("the last session was killed: off, and restore of that session's stage and region is next", async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    // A personal stage in another region: what `dev restore` must be told, it does not assume.
    log.emit('session.starting', { stage: 'alice', region: 'eu-west-1' })
    log.emit('session.ready', {})
    log.close()
    const { result, text } = await run(dir)
    expect(text).toBe(
      'Dev Mode is off here. The last session ended without restoring its functions.\n' +
        'Run "serverless dev restore --stage alice --region eu-west-1" to restore any function it left in Dev Mode.',
    )
    expect(result).toMatchObject({
      state: 'off',
      next: [
        {
          command: 'serverless dev restore --stage alice --region eu-west-1',
          when: expect.any(String),
        },
      ],
    })
  })

  test('a killed session started with --aws-profile: the restore next uses that profile', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.starting', {
      stage: 'alice',
      region: 'eu-west-1',
      aws_profile: 'sandbox',
    })
    log.emit('session.ready', {})
    log.close()
    const { result } = await run(dir)
    expect(result.next[0].command).toBe(
      'serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox',
    )
    // An agent runs a next step with --json added: the restore takes it too.
    expect(runnable(`${result.next[0].command} --json`)).toEqual({
      command: 'dev restore',
      options: {
        stage: 'alice',
        region: 'eu-west-1',
        'aws-profile': 'sandbox',
        json: true,
      },
    })
  })

  test('a killed session whose start record is gone: the plain restore is next', async () => {
    const dir = serviceDir()
    const log = openEventLog({ dir: devDir(dir), sessionId: testSessionId(1) })
    log.emit('session.ready', {})
    log.close()
    const { result } = await run(dir)
    expect(result.next).toEqual([
      { command: 'serverless dev restore', when: expect.any(String) },
    ])
  })

  test('a session still starting (no endpoint yet) or not answering is told from its session file', async () => {
    const dir = serviceDir()
    await claimSession({
      dir: devDir(dir),
      record: {
        ...RECORD,
        state: 'starting',
        control: null,
        pid: process.pid,
        started_at: new Date().toISOString(),
      },
    })
    const starting = await run(dir)
    expect(starting.result).toMatchObject({
      state: 'starting',
      session_id: testSessionId(1),
      message: 'Dev Mode is starting here.',
    })
    expect(starting.text).toContain(
      `Dev Mode starting · session ${testSessionId(1)}`,
    )
  })

  test.each([
    [
      'an old record still marked starting',
      { state: 'starting', started_at: '2020-01-01T00:00:00.000Z' },
    ],
    ['an on record without an endpoint', { state: 'on' }],
  ])(
    '%s whose pid names another live process is no session: off',
    async (_, fields) => {
      const dir = serviceDir()
      fs.mkdirSync(devDir(dir), { recursive: true })
      fs.writeFileSync(
        path.join(devDir(dir), 'session.json'),
        JSON.stringify({ ...RECORD, control: null, ...fields }),
      )
      const { result } = await run(dir, { isAlive: () => true })
      expect(result).toMatchObject({ status: 'ok', state: 'off' })
    },
  )

  test('a session that answers its status with an error is told as such, from its session file', async () => {
    const dir = serviceDir()
    await claimSession({
      dir: devDir(dir),
      record: { ...RECORD, pid: process.pid },
    })
    const broken = await run(dir, {
      connect: async () => ({
        status: async () => ({ status: 500, body: { error: 'internal' } }),
      }),
      isAlive: () => true,
    })
    expect(broken.result).toMatchObject({
      state: 'on',
      message:
        'The Dev Mode session here could not give its status; this is what its session file says.',
    })
    const silent = await run(dir, { isAlive: () => true })
    expect(silent.result.message).toBe(
      'The Dev Mode session here did not answer; this is what its session file says.',
    )
  })
})
