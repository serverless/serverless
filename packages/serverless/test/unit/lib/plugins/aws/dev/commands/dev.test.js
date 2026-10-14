import { describe, expect, jest, test } from '@jest/globals'
import { runDevCommand } from '../../../../../../../lib/plugins/aws/dev/commands/dev.js'
import { envelope } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { AGENT_HINT } from '../../../../../../../lib/plugins/aws/dev/attach/output.js'
import { fakeLog } from '../attach/fakes.js'

const stdout = () => ({
  written: [],
  write(text) {
    this.written.push(text)
  },
})
const run = (options, deps = {}) => {
  const logger = Object.assign(fakeLog(), { logoDevMode: jest.fn() })
  const out = stdout()
  const runSession = jest.fn(async () => 0)
  const runDryRun = jest.fn(async () => ({
    result: envelope({
      status: 'ok',
      message: 'Dry run: nothing was changed.',
    }),
    human: 'dry run text',
  }))
  const exitCode = runDevCommand({
    serverless: { serviceDir: '/service' },
    provider: {},
    options,
    logger,
    deps: { runSession, runDryRun, stdout: out, ...deps },
  })
  return { exitCode, logger, out, runSession, runDryRun }
}

describe('serverless dev', () => {
  test('a foreground session prints the logo, then runs', async () => {
    const { exitCode, logger, runSession, runDryRun } = run({ stage: 'dev' })
    expect(await exitCode).toBe(0)
    expect(logger.logoDevMode).toHaveBeenCalledTimes(1)
    expect(runSession).toHaveBeenCalledWith({
      serverless: { serviceDir: '/service' },
      provider: {},
      options: { stage: 'dev' },
    })
    expect(runDryRun).not.toHaveBeenCalled()
  })

  test('the plugin never prints the agent hint: the CLI runner printed it before sign-in', async () => {
    const { exitCode, logger } = run({})
    expect(await exitCode).toBe(0)
    expect(logger.text()).not.toContain(AGENT_HINT)
  })

  test('a foreground session passes its exit code on', async () => {
    const { exitCode } = run({}, { runSession: async () => 3 })
    expect(await exitCode).toBe(3)
  })

  test('--dry-run --json prints one result on stdout and starts nothing', async () => {
    const { exitCode, out, runSession, runDryRun, logger } = run({
      'dry-run': true,
      json: true,
    })
    expect(await exitCode).toBe(0)
    expect(runDryRun).toHaveBeenCalledTimes(1)
    expect(runSession).not.toHaveBeenCalled()
    expect(logger.logoDevMode).not.toHaveBeenCalled()
    expect(out.written).toHaveLength(1)
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      v: 1,
      status: 'ok',
    })
    // The human text goes to the logger (stderr), never to stdout.
    expect(logger.text()).toBe('dry run text')
  })

  test('--dry-run without --json prints the human text only', async () => {
    const { exitCode, out, logger } = run({ 'dry-run': true })
    expect(await exitCode).toBe(0)
    expect(out.written).toEqual([])
    expect(logger.text()).toBe('dry run text')
  })

  test('a failing dry run passes its exit code on', async () => {
    const { exitCode, out } = run(
      { 'dry-run': true, json: true },
      {
        runDryRun: async () => ({
          result: envelope({
            status: 'error',
            reason: 'stage_protected',
            message: 'no',
          }),
          human: 'no',
        }),
      },
    )
    expect(await exitCode).toBe(1)
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      status: 'error',
      reason: 'stage_protected',
    })
  })
})

const HELP_REMOVE =
  '--on-exit remove does not go with --detach: removing the service asks for confirmation at a terminal, which a session in the background does not have. Use --on-exit keep, or run "serverless remove" after "serverless dev stop".'

describe('strict option combinations', () => {
  test.each([
    [
      { 'idle-timeout': '5m' },
      '--idle-timeout works only with --detach: a session in a terminal never stops on its own.',
    ],
    [
      { detach: true, 'dry-run': true },
      '--detach and --dry-run do not go together: a dry run changes nothing and ends at once.',
    ],
    [{ detach: true, 'on-exit': 'remove' }, HELP_REMOVE],
  ])('%p is invalid_option_combination', async (options, message) => {
    const { exitCode, out, runSession } = run({ ...options, json: true })
    expect(await exitCode).toBe(1)
    expect(runSession).not.toHaveBeenCalled()
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      status: 'error',
      reason: 'invalid_option_combination',
      message,
    })
  })

  test('a bad --on-exit with --json is the envelope too, and nothing starts', async () => {
    const runDetach = jest.fn()
    const { exitCode, out, runSession } = run(
      { detach: true, json: true, 'on-exit': 'bogus' },
      { runDetach },
    )
    expect(await exitCode).toBe(1)
    expect(runDetach).not.toHaveBeenCalled()
    expect(runSession).not.toHaveBeenCalled()
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'Option "--on-exit" must be "keep" or "remove".',
    })
  })

  test('without --json the refusal is the CLI error', async () => {
    await expect(run({ 'idle-timeout': '5m' }).exitCode).rejects.toMatchObject({
      code: 'DEV_MODE_INVALID_OPTION_COMBINATION',
    })
  })

  test('a bad --idle-timeout is invalid_option_value, refused before anything starts', async () => {
    const runDetach = jest.fn()
    const { exitCode, out } = run(
      { detach: true, json: true, 'idle-timeout': 'soon' },
      { runDetach },
    )
    expect(await exitCode).toBe(1)
    expect(runDetach).not.toHaveBeenCalled()
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      status: 'error',
      reason: 'invalid_option_value',
      message:
        'Option "--idle-timeout" takes a duration such as 100 or 100s (seconds), 5m or 1h, or 0 to turn it off.',
    })
  })

  test('an --idle-timeout under a minute is invalid_option_value', async () => {
    const runDetach = jest.fn()
    const { exitCode, out } = run(
      { detach: true, json: true, 'idle-timeout': '30s' },
      { runDetach },
    )
    expect(await exitCode).toBe(1)
    expect(runDetach).not.toHaveBeenCalled()
    expect(JSON.parse(out.written.join(''))).toMatchObject({
      status: 'error',
      reason: 'invalid_option_value',
      message:
        'Option "--idle-timeout" must be at least 1m, or 0 to turn it off.',
    })
  })

  test('--detach starts the background session; the session process runs in the foreground', async () => {
    const runDetach = jest.fn(async () => ({
      result: envelope({ status: 'ok', session_id: 's_3f2a9c1e0b4d' }),
      human: 'Dev Mode on in the background',
    }))
    const launched = run({ detach: true, json: true }, { runDetach })
    expect(await launched.exitCode).toBe(0)
    expect(runDetach).toHaveBeenCalledTimes(1)
    expect(launched.runSession).not.toHaveBeenCalled()
    expect(launched.logger.logoDevMode).not.toHaveBeenCalled()
    expect(JSON.parse(launched.out.written.join(''))).toMatchObject({
      status: 'ok',
      session_id: 's_3f2a9c1e0b4d',
    })

    const child = run(
      { 'session-process': true, 'idle-timeout': '30m' },
      { runDetach },
    )
    expect(await child.exitCode).toBe(0)
    expect(child.runSession).toHaveBeenCalledTimes(1)
    expect(runDetach).toHaveBeenCalledTimes(1)
  })
})
