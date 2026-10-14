import { describe, expect, test } from '@jest/globals'
import {
  ACTION_REQUIRED,
  jsonNeedsFinite,
  REASONS,
  envelope,
  errorResult,
  exitCodeOf,
  isActionRequired,
  jsonRequested,
  printResult,
  isRestoreNext,
  restoreAfterStopNext,
  restoreCommand,
  restoreNext,
  reasonOf,
} from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { fakeLog } from '../attach/fakes.js'

const REGISTRY = new Set([
  'already_running',
  'session_running',
  'session_not_running',
  'session_ended',
  'cursor_from_other_session',
  'invalid_cursor',
  'timeout',
  'invocation_not_found',
  'ambiguous_request_id',
  'stage_mismatch',
  'restore_incomplete',
  'attach_incomplete',
  'stop_failed',
  'detach_failed',
  'control_unavailable',
  'approval_needs_terminal',
  'invalid_option_combination',
  'stage_protected',
  'region_no_broker',
  'signin_required',
  'aws_credentials_missing',
  'credentials_expired',
  'permission_denied',
  'network_blocked',
  'broker_missing',
  'layers_missing',
  'nothing_to_attach',
  'replayed_redacted_event',
  'invalid_option_value',
  'error',
])

describe('reasonOf', () => {
  test('maps every Dev Mode error code to a published reason', () => {
    for (const reason of Object.values(REASONS))
      expect(REGISTRY).toContain(reason)
    for (const reason of ACTION_REQUIRED) expect(REGISTRY).toContain(reason)
    expect([...ACTION_REQUIRED].sort()).toEqual([
      'approval_needs_terminal',
      'aws_credentials_missing',
      'broker_missing',
      'credentials_expired',
      'network_blocked',
      'permission_denied',
      'signin_required',
    ])
    for (const code of [
      'DEV_MODE_INVALID_DURATION',
      'DEV_MODE_INVALID_WAIT_FOR',
      'DEV_MODE_INVALID_LIMIT',
    ]) {
      expect(reasonOf({ code })).toBe('invalid_option_value')
    }
    expect(reasonOf({ code: 'DEV_SETUP_AWS_CREDENTIALS_MISSING' })).toBe(
      'aws_credentials_missing',
    )
    expect(reasonOf({ code: 'DEV_MODE_STAGE_PROTECTED' })).toBe(
      'stage_protected',
    )
    expect(reasonOf({ code: 'DEV_MODE_IOT_UNREACHABLE' })).toBe(
      'network_blocked',
    )
    expect(reasonOf({ code: 'DEV_MODE_SESSION_RUNNING' })).toBe(
      'session_running',
    )
  })

  test("an error's own reason wins; an unknown code is 'error'", () => {
    expect(reasonOf({ reason: 'invalid_cursor', code: 'X' })).toBe(
      'invalid_cursor',
    )
    expect(reasonOf({ code: 'SOMETHING_ELSE' })).toBe('error')
    expect(reasonOf(new Error('x'))).toBe('error')
    expect(reasonOf(undefined)).toBe('error')
  })
})

describe('the envelope', () => {
  test('puts v, status and the shared fields first, drops undefined, keeps command fields', () => {
    const shaped = envelope({
      cursor: 's_1:3',
      state: 'on',
      status: 'ok',
      skipped: undefined,
      v: 9,
    })
    expect(shaped).toEqual({ v: 1, status: 'ok', cursor: 's_1:3', state: 'on' })
    expect(Object.keys(shaped)).toEqual(['v', 'status', 'cursor', 'state'])
    expect(
      envelope({ status: 'action_required', reason: 'signin_required' }),
    ).toEqual({
      v: 1,
      status: 'action_required',
      reason: 'signin_required',
      user_action_required: true,
    })
  })

  test.each([
    [{ status: 'ok' }, 0],
    [{}, 0],
    [{ status: 'error', reason: 'session_running' }, 1],
    [{ status: 'error', reason: 'restore_incomplete' }, 3],
    [{ status: 'error', reason: 'attach_incomplete' }, 3],
    [{ status: 'action_required', reason: 'permission_denied' }, 1],
    [{ status: 'timeout', reason: 'timeout' }, 124],
  ])('%p exits %p', (result, code) => {
    expect(exitCodeOf(result)).toBe(code)
  })

  test('a configuration a person must fix is an error, not an action: no user_action_required', () => {
    for (const code of [
      'DEV_MODE_NOTHING_TO_ATTACH',
      'DEV_MODE_STAGE_PROTECTED',
      'DEV_MODE_INVALID_DURATION',
    ]) {
      const result = errorResult({ code, message: 'm' })
      expect(result.status).toBe('error')
      expect(result).not.toHaveProperty('user_action_required')
      expect(exitCodeOf(result)).toBe(1)
    }
    // A plain error (a bug, a file that cannot be read) is reason 'error', exit 1.
    expect(errorResult(new Error('boom'))).toEqual({
      status: 'error',
      reason: 'error',
      message: 'boom',
    })
  })

  test('the shared copy: the foreground --json refusal and the restore step', () => {
    expect(jsonNeedsFinite()).toBe(
      '--json works with --detach or --dry-run; a running session writes its events to .serverless/dev/session.ndjson.',
    )
    expect(restoreNext({ stage: 'dev', region: 'us-east-1' })).toEqual({
      command: 'serverless dev restore --stage dev --region us-east-1',
      when: 'to restore the functions a session that did not stop cleanly may have left attached',
    })
  })

  test("a restore it suggests names the session's stage and region, which dev restore does not assume", () => {
    // A session record, a session.starting record or a plain scope.
    const session = {
      session_id: 's_1',
      stage: 'alice',
      region: 'eu-west-1',
      pid: 42,
    }
    expect(restoreCommand(session)).toBe(
      'serverless dev restore --stage alice --region eu-west-1',
    )
    expect(restoreCommand(session, { functionKey: 'api' })).toBe(
      'serverless dev restore --stage alice --region eu-west-1 --function api',
    )
    // Several functions: one --function each, quoted only when a shell needs it.
    expect(
      restoreCommand(session, { functionKeys: ['api', 'my worker'] }),
    ).toBe(
      "serverless dev restore --stage alice --region eu-west-1 --function api --function 'my worker'",
    )
    expect(restoreNext(session).command).toBe(restoreCommand(session))
    expect(isRestoreNext(restoreNext(session))).toBe(true)
    expect(restoreAfterStopNext(session)).toEqual({
      command: 'serverless dev restore --stage alice --region eu-west-1',
      when: 'after stopping that session with Ctrl+C in its terminal',
    })
    expect(isRestoreNext(restoreAfterStopNext(session))).toBe(false)
    // A session started with --aws-profile: the restore uses the same profile, before --function.
    const profiled = { ...session, aws_profile: 'sandbox' }
    expect(restoreCommand(profiled, { functionKey: 'api' })).toBe(
      'serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox --function api',
    )
    expect(restoreNext(profiled).command).toBe(
      'serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox',
    )
    expect(restoreAfterStopNext(profiled).command).toBe(
      restoreNext(profiled).command,
    )
    // A name of ordinary characters is printed as it is, so it reads the same in every shell.
    for (const name of ['dev@team', 'org:sso=admin+ro/eu.west_1-a']) {
      expect(restoreCommand({ ...session, aws_profile: name })).toBe(
        `serverless dev restore --stage alice --region eu-west-1 --aws-profile ${name}`,
      )
    }
    // A name with other characters, a space say, is quoted.
    expect(restoreCommand({ ...session, aws_profile: 'my team' })).toBe(
      "serverless dev restore --stage alice --region eu-west-1 --aws-profile 'my team'",
    )
    // A record whose aws_profile is not a non-empty string (written by hand, or corrupt) gives no
    // --aws-profile, and never throws.
    for (const value of [42, {}, ['a'], true, '']) {
      expect(restoreCommand({ ...session, aws_profile: value })).toBe(
        'serverless dev restore --stage alice --region eu-west-1',
      )
    }
    // Nothing known about the session: the plain command.
    for (const unknown of [undefined, null, {}]) {
      expect(restoreCommand(unknown)).toBe('serverless dev restore')
    }
  })

  test('an error result says whether a person must act, and carries next', () => {
    expect(
      errorResult({ code: 'DEV_MODE_IOT_ACCESS_DENIED', message: 'denied' }),
    ).toEqual({
      status: 'action_required',
      reason: 'permission_denied',
      message: 'denied',
      user_action_required: true,
    })
    const next = [
      { command: 'serverless dev stop', when: 'to end the running session' },
    ]
    expect(
      errorResult(
        Object.assign(new Error('running'), {
          code: 'DEV_MODE_SESSION_RUNNING',
          next,
        }),
      ),
    ).toEqual({
      status: 'error',
      reason: 'session_running',
      message: 'running',
      next,
    })
  })
})

describe('the envelope keeps its shape', () => {
  test('user_action_required sits in the shared order even when the input lacks it', () => {
    const shaped = envelope({
      extra: 1,
      cursor: 's_1:3',
      next: [{ command: 'serverless login', when: 'to sign in' }],
      message: 'Sign in first.',
      reason: 'signin_required',
      status: 'action_required',
    })
    expect(Object.keys(shaped)).toEqual([
      'v',
      'status',
      'reason',
      'message',
      'user_action_required',
      'next',
      'cursor',
      'extra',
    ])
    expect(shaped.user_action_required).toBe(true)
  })

  test("an error result's command fields never replace its status or reason", () => {
    const result = errorResult(
      { code: 'DEV_MODE_IOT_ACCESS_DENIED', message: 'denied' },
      { status: 'ok', reason: 'error', cursor: 's_1:2' },
    )
    expect(result).toEqual({
      status: 'action_required',
      reason: 'permission_denied',
      message: 'denied',
      user_action_required: true,
      cursor: 's_1:2',
    })
    expect(
      errorResult(new Error('boom'), { status: 'timeout', state: 'off' }),
    ).toEqual({
      status: 'error',
      reason: 'error',
      message: 'boom',
      state: 'off',
    })
  })

  test('ACTION_REQUIRED is a frozen list, asked through isActionRequired', () => {
    expect(Array.isArray(ACTION_REQUIRED)).toBe(true)
    expect(Object.isFrozen(ACTION_REQUIRED)).toBe(true)
    expect(() => ACTION_REQUIRED.push('error')).toThrow()
    expect(isActionRequired('permission_denied')).toBe(true)
    expect(isActionRequired('nothing_to_attach')).toBe(false)
    expect(isActionRequired('stage_protected')).toBe(false)
    expect(isActionRequired(undefined)).toBe(false)
  })
})

describe('printResult', () => {
  const stdout = () => ({
    written: [],
    write(text) {
      this.written.push(text)
    },
  })
  test('with --json the envelope is the only thing on stdout; human text goes to the logger', () => {
    const out = stdout()
    const logger = fakeLog()
    const code = printResult({
      json: true,
      result: {
        status: 'timeout',
        reason: 'timeout',
        message: 'still stopping',
      },
      human: ['plain line', ['warning', 'a warning']],
      logger,
      stdout: out,
    })
    expect(code).toBe(124)
    expect(out.written).toEqual([
      '{"v":1,"status":"timeout","reason":"timeout","message":"still stopping"}\n',
    ])
    expect(logger.lines).toEqual([
      { level: 'notice', text: 'plain line' },
      { level: 'warning', text: 'a warning' },
    ])
  })

  test('without --json nothing goes to stdout', () => {
    const out = stdout()
    expect(
      printResult({
        json: false,
        result: { status: 'ok' },
        human: 'x',
        logger: fakeLog(),
        stdout: out,
      }),
    ).toBe(0)
    expect(out.written).toEqual([])
    expect(jsonRequested({ json: true })).toBe(true)
    expect(jsonRequested({})).toBe(false)
    // As the CLI parses --json=<value>: a string.
    for (const on of ['true', '1', 'TRUE']) {
      expect(jsonRequested({ json: on })).toBe(true)
    }
    for (const off of ['false', '0', '', false]) {
      expect(jsonRequested({ json: off })).toBe(false)
    }
    // A repeated flag counts by its last value.
    expect(jsonRequested({ json: [true, 'false'] })).toBe(false)
  })
})

describe('the reasons a dry run reports', () => {
  test.each([
    ['DEV_MODE_STAGE_PROTECTED', 'stage_protected', 'error'],
    ['DEV_MODE_REGION_NO_BROKER', 'region_no_broker', 'error'],
    ['DEV_MODE_IOT_ACCESS_DENIED', 'permission_denied', 'action_required'],
    ['DEV_MODE_IDENTITY_ACCESS_DENIED', 'permission_denied', 'action_required'],
    ['DEV_MODE_STACK_ACCESS_DENIED', 'permission_denied', 'action_required'],
    ['DEV_MODE_LAYER_ACCESS_DENIED', 'permission_denied', 'action_required'],
    ['DEV_MODE_AWS_UNREACHABLE', 'network_blocked', 'action_required'],
    ['DEV_MODE_NOTHING_TO_ATTACH', 'nothing_to_attach', 'error'],
    [
      'DEV_MODE_APPROVE_NEEDS_TERMINAL',
      'approval_needs_terminal',
      'action_required',
    ],
    [
      'DEV_MODE_INVALID_OPTION_COMBINATION',
      'invalid_option_combination',
      'error',
    ],
  ])('%s gives reason %s, status %s', (code, reason, status) => {
    const fields = errorResult(Object.assign(new Error('m'), { code }))
    expect(fields).toMatchObject({ status, reason, message: 'm' })
    expect(Boolean(fields.user_action_required)).toBe(
      status === 'action_required',
    )
  })
})
