import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runDevReplay } from '../../../../../../../lib/plugins/aws/dev/commands/replay.js'
import { exitCodeOf } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { REPLAY_MARGIN_MS } from '../../../../../../../lib/plugins/aws/dev/local/replay.js'
import {
  FILES,
  fnDirOf,
  invocationFileName,
  requestFileName,
} from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import {
  REQUEST_REPLAY_MARGIN_MS,
  REQUEST_REPLAY_TIMEOUT_MS,
} from '../../../../../../../lib/plugins/aws/dev/web/replay.js'
import { findInvocation } from '../../../../../../../lib/plugins/aws/dev/state/read.js'
import { runnable } from './runnable.js'
import {
  resetCliNames,
  setCliNames,
} from '../../../../../../../lib/plugins/aws/dev/commands/cli-names.js'

const ID = '3f2a9c1e-1111-4111-8111-11111111111b'
const RECORD = {
  request_id: ID,
  function: 'createOrder',
  deployed_timeout_s: 6,
}
const FIELDS = {
  request_id: '9b1c2d3e-0000-4000-8000-00000000000a',
  replay_of: ID,
  function: 'createOrder',
  outcome: 'error',
  status_code: 502,
  duration_ms: 41,
  error: {
    type: 'TypeError',
    message: 'Cannot read properties of undefined',
    stack: [],
  },
  file: '.serverless/dev/invocations/createOrder/1759661100-9b1c2d3e-0000-4000-8000-00000000000a.json',
}
/** A client whose replay answers `{ status, body }`, as the control client does. */
const answering = (status, body) => ({
  replay: jest.fn(async () => ({ status, body })),
})
const run = (options, deps) =>
  runDevReplay({
    serviceDir: '/service',
    options,
    deps: { find: async () => ({ record: RECORD, file: 'x' }), ...deps },
  })

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
/** A service directory with one recorded invocation of `id`, for the real reader. */
const recorded = (id) => {
  const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(service)
  const file = path.join(
    service,
    '.serverless',
    'dev',
    FILES.invocations,
    fnDirOf('createOrder'),
    invocationFileName({
      startedAtMs: Date.parse('2026-10-05T10:41:07.512Z'),
      requestId: id,
    }),
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      request_id: id,
      function: 'createOrder',
      deployed_timeout_s: 6,
    }),
  )
  return service
}

describe('dev replay', () => {
  test('prints the replay result; it ran, so the exit code is 0 even when the handler failed', async () => {
    const client = answering(200, FIELDS)
    const { result, human } = await run(
      { requestId: ID.slice(0, 8) },
      { connect: async () => client },
    )
    expect(result).toMatchObject({ v: 1, status: 'ok', ...FIELDS })
    expect(exitCodeOf(result)).toBe(0)
    expect(client.replay).toHaveBeenCalledWith(ID, {
      timeoutMs: 6_000 + REPLAY_MARGIN_MS,
    })
    // The file is a secondary line, in the logger's aside style.
    expect(human).toEqual([
      [
        'notice',
        'Replayed 3f2a9c1e on createOrder as 9b1c2d3e (no caller received it): error · 502 · 41 ms',
      ],
      ['notice', 'TypeError: Cannot read properties of undefined'],
      ['aside', FIELDS.file],
    ])
  })

  test('from a Compose root, the result and its line name the file from there', async () => {
    setCliNames({
      serverless: {
        serviceDir: path.resolve('/projects/shop/consumer'),
        compose: { isWithinCompose: true, serviceName: 'consumer' },
      },
      cwd: path.resolve('/projects/shop'),
    })
    try {
      const { result, human } = await run(
        { requestId: ID.slice(0, 8) },
        { connect: async () => answering(200, FIELDS) },
      )
      expect(result.file).toBe(`consumer/${FIELDS.file}`)
      expect(human).toContainEqual(['aside', `consumer/${FIELDS.file}`])
    } finally {
      resetCliNames()
    }
  })

  test('an invocation of another stage is not replayed on this one; its next steps run in order', async () => {
    const client = {
      ...answering(200, FIELDS),
      record: { stage: 'alice', region: 'eu-west-1', aws_profile: 'dev' },
    }
    const { result } = await run(
      { requestId: ID.slice(0, 8) },
      {
        connect: async () => client,
        find: async () => ({ record: { ...RECORD, stage: 'bob' }, file: 'x' }),
      },
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'stage_mismatch',
      message:
        'Request 3f2a9c1e ran on stage "bob", and the Dev Mode session here runs stage "alice": a replay would run it with the other stage\'s configuration and role. Stop this session, then start one of stage "bob" and replay it there once createOrder has been invoked through AWS on that stage: a new session gets its role\'s credentials only from a real invocation.',
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(client.replay).not.toHaveBeenCalled()
    // Each step is a command the CLI accepts, run in this order: stop this session (one session
    // per directory), start one of the recorded stage, replay there.
    const steps = result.next.map(({ command }) => runnable(command))
    expect(steps).toEqual([
      {
        command: 'dev stop',
        options: { stage: 'alice', region: 'eu-west-1', 'aws-profile': 'dev' },
      },
      {
        command: 'dev',
        options: {
          detach: true,
          stage: 'bob',
          region: 'eu-west-1',
          'aws-profile': 'dev',
        },
      },
      {
        command: 'dev replay',
        options: {
          requestId: ID,
          stage: 'bob',
          region: 'eu-west-1',
          'aws-profile': 'dev',
        },
      },
    ])
    expect(result.next.map(({ when }) => when)).toEqual([
      'to stop this session first',
      'then to start a session of stage "bob"',
      'then, once createOrder has been invoked through AWS on stage "bob" (a new session gets its role\'s credentials only from a real invocation), to replay the request there',
    ])
  })

  test('the redacted-copy note and an omitted response each have their line', async () => {
    const { result, human } = await run(
      { requestId: ID },
      {
        connect: async () =>
          answering(200, {
            ...FIELDS,
            note: 'replayed_redacted_event',
            response_omitted: true,
          }),
      },
    )
    expect(result).toMatchObject({
      note: 'replayed_redacted_event',
      response_omitted: true,
    })
    expect(human).toContainEqual([
      'aside',
      'The original event was no longer in memory, so the redacted copy from its file was replayed: headers such as Authorization were sent as "[redacted]".',
    ])
    expect(human).toContainEqual([
      'aside',
      'The response is larger than 64 KiB; it is in the file above.',
    ])
  })

  test('needs a running session', async () => {
    const { result } = await run(
      { requestId: ID },
      { connect: async () => null },
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_not_running',
      next: [{ command: 'serverless dev --detach' }],
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('an unknown id is refused before the session is asked', async () => {
    const connect = jest.fn()
    const { result } = await run(
      { requestId: 'ffffffff' },
      {
        connect,
        find: async () => {
          throw Object.assign(
            new Error('No recorded invocation has the id ffffffff.'),
            {
              reason: 'invocation_not_found',
            },
          )
        },
      },
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'invocation_not_found',
      next: [{ command: 'serverless dev requests' }],
    })
    expect(connect).not.toHaveBeenCalled()
  })

  test.each([undefined, '', '   '])(
    'no request id (%p) is invalid_option_value',
    async (requestId) => {
      const connect = jest.fn()
      const { result } = await run({ requestId }, { connect })
      expect(result).toMatchObject({
        status: 'error',
        reason: 'invalid_option_value',
        next: [{ command: 'serverless dev requests' }],
      })
      expect(exitCodeOf(result)).toBe(1)
      expect(connect).not.toHaveBeenCalled()
    },
  )

  test('a prefix shorter than 8 characters is ambiguous_request_id; the full id matches', async () => {
    const service = recorded(ID)
    const client = answering(200, FIELDS)
    const short = await runDevReplay({
      serviceDir: service,
      options: { requestId: ID.slice(0, 6) },
      deps: { find: findInvocation, connect: async () => client },
    })
    expect(short.result).toMatchObject({
      status: 'error',
      reason: 'ambiguous_request_id',
      next: [{ command: 'serverless dev requests' }],
    })
    expect(client.replay).not.toHaveBeenCalled()
    const full = await runDevReplay({
      serviceDir: service,
      options: { requestId: ID },
      deps: { find: findInvocation, connect: async () => client },
    })
    expect(full.result.status).toBe('ok')
  })

  test('the session answers 404 and 409 with their reasons, anything else is an error', async () => {
    for (const [status, body, reason, message] of [
      [
        404,
        { reason: 'invocation_not_found', message: 'gone' },
        'invocation_not_found',
        'gone',
      ],
      [
        409,
        { reason: 'ambiguous_request_id', message: 'two' },
        'ambiguous_request_id',
        'two',
      ],
      [
        409,
        {
          reason: 'error',
          message: 'Dev Mode is stopping; nothing more runs on this machine.',
        },
        'error',
        'Dev Mode is stopping; nothing more runs on this machine.',
      ],
      [
        500,
        { error: 'internal' },
        'error',
        'The Dev Mode session could not run the replay (HTTP 500).',
      ],
    ]) {
      const { result } = await run(
        { requestId: ID },
        { connect: async () => answering(status, body) },
      )
      expect(result).toMatchObject({ status: 'error', reason, message })
      expect(exitCodeOf(result)).toBe(1)
    }
  })

  test('a replay that outlives the function timeout exits 124', async () => {
    const { result } = await run(
      { requestId: ID },
      {
        connect: async () => ({
          replay: async () => {
            throw Object.assign(new Error('The operation was aborted'), {
              name: 'AbortError',
            })
          },
        }),
      },
    )
    expect(result).toMatchObject({
      status: 'timeout',
      reason: 'timeout',
      replay_of: ID,
      function: 'createOrder',
    })
    expect(exitCodeOf(result)).toBe(124)
  })

  test('an unexpected error is an error result with exit 1, never ok', async () => {
    const { result } = await run(
      { requestId: ID },
      {
        connect: async () => ({
          replay: async () => {
            throw new Error('socket hang up')
          },
        }),
      },
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'socket hang up',
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  describe('a web request', () => {
    const WEB_ID = '5e4d3c2b-0000-4000-8000-000000000001'
    const WEB_FIELDS = {
      kind: 'request',
      request_id: '0f0e0d0c-0000-4000-8000-000000000002',
      replay_of: WEB_ID,
      web_app: 'api',
      method: 'POST',
      path: '/orders',
      outcome: 'answered',
      status_code: 201,
      duration_ms: 17,
      file: '.serverless/dev/requests/api/1759661100-0f0e0d0c-0000-4000-8000-000000000002.json',
      note: 'redacted_values_omitted',
      omitted: ['authorization', 'cookie'],
    }
    /** A service directory with one recorded request to `api`, for the real reader. */
    const recordedRequest = (fields = {}) => {
      const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
      dirs.push(service)
      const file = path.join(
        service,
        '.serverless',
        'dev',
        FILES.requests,
        'api',
        requestFileName({
          startedAtMs: Date.parse('2026-10-05T10:41:07.512Z'),
          requestId: WEB_ID,
        }),
      )
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(
        file,
        JSON.stringify({
          v: 1,
          request_id: WEB_ID,
          web_app: 'api',
          stage: 'alice',
          request: { method: 'POST', path: '/orders', headers: {} },
          ...fields,
        }),
      )
      return service
    }

    test('replay sends the recorded request to the running session, which replays it as a web request', async () => {
      const client = {
        ...answering(200, WEB_FIELDS),
        record: { stage: 'alice' },
      }
      const { result, human } = await runDevReplay({
        serviceDir: recordedRequest(),
        options: { requestId: WEB_ID.slice(0, 8) },
        deps: { connect: async () => client },
      })
      expect(result).toMatchObject({ v: 1, status: 'ok', ...WEB_FIELDS })
      expect(exitCodeOf(result)).toBe(0)
      expect(client.replay).toHaveBeenCalledWith(WEB_ID, {
        kind: 'request',
        timeoutMs: REQUEST_REPLAY_TIMEOUT_MS + REQUEST_REPLAY_MARGIN_MS,
      })
      expect(human).toEqual([
        [
          'notice',
          'Replayed 5e4d3c2b on api (POST /orders) as 0f0e0d0c (no caller received it): answered · 201 · 17 ms',
        ],
        ['aside', WEB_FIELDS.file],
        [
          'aside',
          'The file keeps no credentials, so the replay left out authorization and cookie.',
        ],
      ])
    })

    test('a request whose body was cut is refused with its reason', async () => {
      const message = `The body of request ${WEB_ID} was larger than 1 MiB and its file keeps only the first 1 MiB, so it is not replayed.`
      const { result } = await runDevReplay({
        serviceDir: recordedRequest(),
        options: { requestId: WEB_ID },
        deps: {
          connect: async () => ({
            ...answering(409, { reason: 'request_body_truncated', message }),
            record: { stage: 'alice' },
          }),
        },
      })
      expect(result).toMatchObject({
        status: 'error',
        reason: 'request_body_truncated',
        message,
      })
      expect(exitCodeOf(result)).toBe(1)
    })

    test('a request of another stage is not replayed on this one', async () => {
      const client = {
        ...answering(200, WEB_FIELDS),
        record: { stage: 'bob', region: 'eu-west-1' },
      }
      const { result } = await runDevReplay({
        serviceDir: recordedRequest(),
        options: { requestId: WEB_ID },
        deps: { connect: async () => client },
      })
      expect(result).toMatchObject({
        status: 'error',
        reason: 'stage_mismatch',
        message:
          'Request 5e4d3c2b ran on stage "alice", and the Dev Mode session here runs stage "bob": a replay would send it to the web app of the other stage. Stop this session, then start one of stage "alice" and replay it there.',
      })
      expect(client.replay).not.toHaveBeenCalled()
      expect(result.next.map(({ command }) => runnable(command))).toEqual([
        { command: 'dev stop', options: { stage: 'bob', region: 'eu-west-1' } },
        {
          command: 'dev',
          options: { detach: true, stage: 'alice', region: 'eu-west-1' },
        },
        {
          command: 'dev replay',
          options: { requestId: WEB_ID, stage: 'alice', region: 'eu-west-1' },
        },
      ])
    })
  })
})
