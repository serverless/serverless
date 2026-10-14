import { describe, expect, jest, test } from '@jest/globals'
import { EventEmitter } from 'events'
import {
  DETAILED_OFF,
  DETAILED_ON,
  KEY_HELP,
  KEYS_HINT,
  hotkeysEnabled,
  startHotkeys,
  statusKeyLines,
} from '../../../../../../../lib/plugins/aws/dev/local/hotkeys.js'
import { computeIsInteractive } from '@serverless/util/src/logger/index.js'
import { fakeLog } from '../attach/fakes.js'
import { fakeTty, until } from './tty.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

const start = () => {
  const stdin = fakeTty()
  const processRef = new EventEmitter()
  const logger = fakeLog()
  const actions = {
    help: jest.fn(),
    reload: jest.fn(),
    detailed: jest.fn(),
    status: jest.fn(),
    quit: jest.fn(),
    interrupt: jest.fn(),
  }
  const keys = startHotkeys({ stdin, processRef, actions, logger })
  return { stdin, processRef, logger, actions, keys }
}
const debugLines = (logger) =>
  logger.lines.filter((line) => line.level === 'debug').map((line) => line.text)

describe('hotkeys', () => {
  test('are on only for a person at a terminal', () => {
    const tty = { isTTY: true, setRawMode() {} }
    const on = { options: {}, stdin: tty, isInteractive: true }
    expect(hotkeysEnabled(on)).toBe(true)
    expect(hotkeysEnabled({ ...on, options: { keys: false } })).toBe(false)
    expect(
      hotkeysEnabled({ ...on, options: { 'session-process': true } }),
    ).toBe(false)
    // The logger's interactivity rule decides (CI, an AI agent, no terminal), then the keys need
    // a terminal on standard input that can be put in raw mode.
    expect(hotkeysEnabled({ ...on, isInteractive: false })).toBe(false)
    expect(hotkeysEnabled({ ...on, stdin: { isTTY: false } })).toBe(false)
    expect(hotkeysEnabled({ ...on, stdin: { isTTY: true } })).toBe(false)
    expect(hotkeysEnabled({ ...on, stdin: undefined })).toBe(false)
    expect(KEYS_HINT).toBe(
      'Press h for keys, Ctrl+C or q to restore your functions and exit.',
    )
  })

  test.each([
    ['a person at a terminal', {}, false, true],
    ['CI', { CI: 'true' }, false, false],
    ['an AI agent', {}, true, false],
    [
      'a person taken for an AI agent who set SLS_INTERACTIVE_SETUP_ENABLE',
      { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
      true,
      true,
    ],
    [
      'CI with SLS_INTERACTIVE_SETUP_ENABLE',
      { CI: 'true', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
      false,
      true,
    ],
  ])('follow the CLI interactivity rule: %s', (_, env, isAgent, expected) => {
    const terminal = { isTTY: true, columns: 120 }
    const stdin = { isTTY: true, setRawMode() {} }
    const isInteractive = computeIsInteractive({
      stdin,
      stdout: terminal,
      stderr: terminal,
      env,
      isAgent,
    })
    expect(hotkeysEnabled({ options: {}, stdin, isInteractive })).toBe(expected)
  })

  test('each key runs its action, whatever its case; other keys run nothing', async () => {
    const { stdin, actions, keys } = start()
    expect(stdin.isRaw).toBe(true)
    for (const key of ['x', 'h', '?', 'R', 'v', 'S', 'Q']) stdin.write(key)
    await until(() => actions.quit.mock.calls.length === 1)
    expect(actions.help).toHaveBeenCalledTimes(2)
    expect(actions.reload).toHaveBeenCalledTimes(1)
    expect(actions.detailed).toHaveBeenCalledTimes(1)
    expect(actions.status).toHaveBeenCalledTimes(1)
    expect(actions.interrupt).not.toHaveBeenCalled()
    keys.close()
  })

  test('Ctrl+C is passed on, as the signal it would have been', async () => {
    const { stdin, actions, keys } = start()
    stdin.write('\x03')
    await until(() => actions.interrupt.mock.calls.length === 1)
    expect(actions.quit).not.toHaveBeenCalled()
    keys.close()
  })

  test('close puts the terminal back and stops reading keys', () => {
    const { stdin, processRef, keys } = start()
    keys.close()
    keys.close()
    expect(stdin.isRaw).toBe(false)
    expect(stdin.isPaused()).toBe(true)
    expect(stdin.listenerCount('keypress')).toBe(0)
    expect(processRef.listenerCount('exit')).toBe(0)
  })

  // The CLI's spinner (ora) reads stdin in raw mode while it spins; when it stops it pauses stdin
  // and puts the terminal back in its normal mode, which would leave the keys deaf.
  test('the keys take the terminal back after a spinner left it in its normal mode', async () => {
    const { stdin, actions, keys } = start()
    stdin.pause()
    stdin.setRawMode(false)
    keys.reclaim()
    expect(stdin.isRaw).toBe(true)
    expect(stdin.isPaused()).toBe(false)
    stdin.write('q')
    await until(() => actions.quit.mock.calls.length === 1)
    keys.close()
    keys.reclaim()
    expect(stdin.isRaw).toBe(false)
    expect(stdin.isPaused()).toBe(true)
  })

  test('a key after close runs nothing', async () => {
    const { stdin, actions, keys } = start()
    keys.close()
    stdin.write('q')
    stdin.resume()
    await new Promise((resolve) => setImmediate(resolve))
    expect(actions.quit).not.toHaveBeenCalled()
  })

  test('the terminal is put back at exit, also after a crash', () => {
    const { stdin, processRef } = start()
    processRef.emit('exit', 1)
    expect(stdin.modes).toEqual([true, false])
  })

  test('an action that fails is a debug line, and the keys keep working', async () => {
    const { stdin, actions, logger, keys } = start()
    actions.reload.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    actions.status.mockImplementationOnce(async () => {
      throw new Error('late boom')
    })
    stdin.write('r')
    stdin.write('s')
    stdin.write('r')
    await until(
      () =>
        actions.reload.mock.calls.length === 2 &&
        debugLines(logger).length === 2,
    )
    expect(debugLines(logger)).toEqual([
      'Dev Mode could not run the reload key: boom',
      'Dev Mode could not run the status key: late boom',
    ])
    keys.close()
  })

  test('the key list and the status lines a person reads', () => {
    expect(KEY_HELP).toBe('Keys: r rebuild · v details · s status · q quit')
    expect([DETAILED_ON, DETAILED_OFF]).toEqual(['Details on', 'Details off'])
    const nowMs = Date.parse('2026-10-05T10:41:19.512Z')
    expect(
      statusKeyLines({
        status: {
          state: 'on',
          session_id: 's_3f2a9c1e0b4d',
          stage: 'alice',
          invocations: { total: 3, errors: 1 },
          last_invocation: {
            request_id: '3f2a9c1e-0000-4000-8000-0000000000aa',
            function: 'createOrder',
            outcome: 'error',
            ts: '2026-10-05T10:41:07.512Z',
          },
          functions: [
            { name: 'createOrder', mode: 'dev' },
            { name: 'report', mode: 'deployed', why: 'Java runs only on AWS' },
          ],
        },
        workers: [
          { functionKey: 'createOrder', pid: 4242, busy: false },
          { functionKey: 'createOrder', pid: 4243, busy: true },
        ],
        nowMs,
      }),
    ).toEqual([
      'Dev Mode on · alice · 1 of 2 functions · 3 invocations, 1 error',
      '  warm: createOrder · last: createOrder error, 12 s ago',
      [
        'Function     Mode      Why',
        'createOrder  dev',
        'report       deployed  Java runs only on AWS',
      ].join('\n'),
    ])
    expect(
      statusKeyLines({
        status: {
          state: 'on',
          session_id: 's_x',
          service: 'orders',
          stage: 'alice',
          invocations: { total: 10, errors: 0 },
          functions: [
            { name: 'api', mode: 'dev' },
            { name: 'worker', mode: 'dev' },
          ],
        },
        workers: [],
        nowMs,
      }),
    ).toEqual([
      'Dev Mode on · orders · alice · 2 functions · 10 invocations, no errors',
      '  warm: none · last: none yet',
      null,
    ])
  })

  test('the s key shows why a function that runs here has a note', () => {
    const [, , table] = statusKeyLines({
      status: {
        functions: [
          { name: 'api', mode: 'dev', notes: ['vpc_egress_required'] },
          { name: 'report', mode: 'deployed', why: 'Java runs only on AWS' },
        ],
      },
    })
    expect(table).toBe(
      [
        'Function  Mode      Why',
        'api       dev       vpc_egress_required',
        'report    deployed  Java runs only on AWS',
      ].join('\n'),
    )
  })

  test('the s key shows a function that stays in Dev Mode but lost what it needs', () => {
    const [summary, , table] = statusKeyLines({
      status: {
        functions: [
          { name: 'api', mode: 'dev' },
          {
            name: 'worker',
            mode: 'dev',
            reason: 'layer_missing',
            why: 'lost the Dev Mode layer; cannot start until it is restored',
          },
        ],
      },
    })
    expect(summary).toBe('Dev Mode on · 2 functions · 0 invocations, no errors')
    expect(table).toBe(
      [
        'Function  Mode  Why',
        'api       dev',
        'worker    dev   lost the Dev Mode layer; cannot start until it is restored',
      ].join('\n'),
    )
  })

  test('a session without its record still shows its status', () => {
    expect(
      statusKeyLines({
        status: { functions: [{ name: 'api', mode: 'dev' }] },
        workers: [{ functionKey: 'api', pid: undefined, busy: true }],
      }),
    ).toEqual([
      'Dev Mode on · 1 function · 0 invocations, no errors',
      '  warm: api · last: none yet',
      null,
    ])
  })
})
