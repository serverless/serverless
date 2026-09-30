// applyAgentSession and shouldDisableColors. A detected AI coding agent gets no ANSI colour codes
// unless the user set FORCE_COLOR (any value: chalk already maps it to a level, so the CLI leaves
// chalk exactly as it would be).
// Sessions without an agent must render exactly as before. The logger's chalk instance and
// renderer colour level are saved and restored around every test through the logger's own
// test helpers, so other suites never see a changed level.
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import {
  applyAgentSession,
  colorizeString,
  getColorSettingsForTests,
  getGlobalRendererSettings,
  log,
  setColorSettingsForTests,
  setGlobalRendererSettings,
  style,
} from '@serverless/util/src/logger/index.js'
import {
  detectAgent,
  resetAgentDetectionForTests,
  shouldDisableColors,
} from '@serverless/util/src/agent/index.js'

const ESC = '\u001b['
const CLAUDE = { isAgent: true, name: 'claude' }
// The colour levels exactly as the logger computed them at load, before any test changed them.
const LOADED_COLORS = getColorSettingsForTests()

let savedColors
let savedRenderer
beforeEach(() => {
  savedColors = getColorSettingsForTests()
  savedRenderer = getGlobalRendererSettings()
  // Truecolor, as in a real terminal; jest's own streams are pipes.
  setColorSettingsForTests({ chalkLevel: 3, colorSupportLevel: 3 })
})
afterEach(() => {
  setColorSettingsForTests(savedColors)
  setGlobalRendererSettings(savedRenderer)
})

const captureStdErr = (fn) => {
  const written = []
  const original = process.stderr.write
  process.stderr.write = (chunk) => {
    written.push(String(chunk))
    return true
  }
  try {
    fn()
  } finally {
    process.stderr.write = original
  }
  return written.join('')
}

const logObject = () =>
  captureStdErr(() => log.get('agent-colors').notice({ count: 1 }))

describe('applyAgentSession colours', () => {
  test('agent without FORCE_COLOR → no escape codes', () => {
    applyAgentSession({ agent: CLAUDE, env: {} })
    expect(style.error('boom')).toBe('boom')
    expect(style.warning('boom')).toBe('boom')
    expect(style.bold('boom')).toBe('boom')
    expect(style.title('boom')).toBe('boom')
    expect(colorizeString('boom')).toBe('boom')
    expect(getColorSettingsForTests()).toEqual({
      chalkLevel: 0,
      colorSupportLevel: 0,
    })
  })

  test('agent without FORCE_COLOR → logged objects carry no escape codes', () => {
    applyAgentSession({ agent: CLAUDE, env: {} })
    const output = logObject()
    expect(output).toContain('count: 1')
    expect(output).not.toContain(ESC)
  })

  test.each([['1'], ['3'], ['true'], [''], ['0'], ['false']])(
    'agent with FORCE_COLOR=%j → colour settings left as chalk set them',
    (value) => {
      applyAgentSession({ agent: CLAUDE, env: { FORCE_COLOR: value } })
      expect(getColorSettingsForTests()).toEqual({
        chalkLevel: 3,
        colorSupportLevel: 3,
      })
      expect(style.error('boom')).not.toBe('boom')
      expect(logObject()).toContain(ESC)
    },
  )

  // The override is the escape hatch for a person wrongly detected as an agent: the session
  // behaves like the human baseline, colours included.
  test('agent with SLS_INTERACTIVE_SETUP_ENABLE → colours unchanged', () => {
    applyAgentSession({
      agent: CLAUDE,
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
    })
    expect(getColorSettingsForTests()).toEqual({
      chalkLevel: 3,
      colorSupportLevel: 3,
    })
    expect(style.error('boom')).not.toBe('boom')
    expect(logObject()).toContain(ESC)
  })

  test('agent with an empty SLS_INTERACTIVE_SETUP_ENABLE → no escape codes', () => {
    applyAgentSession({
      agent: CLAUDE,
      env: { SLS_INTERACTIVE_SETUP_ENABLE: '' },
    })
    expect(style.error('boom')).toBe('boom')
  })

  // The zero-width veto only concerns the spinner's clear-line math; colours follow the override.
  test('agent with the override on a zero-width TTY → not interactive, colours unchanged', () => {
    const streams = [process.stdout, process.stderr]
    const saved = streams.map((stream) => ({
      isTTY: Object.getOwnPropertyDescriptor(stream, 'isTTY'),
      columns: Object.getOwnPropertyDescriptor(stream, 'columns'),
    }))
    for (const stream of streams) {
      Object.defineProperty(stream, 'isTTY', {
        value: true,
        configurable: true,
      })
      Object.defineProperty(stream, 'columns', {
        value: 0,
        configurable: true,
      })
    }
    try {
      applyAgentSession({
        agent: CLAUDE,
        env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
      })
    } finally {
      streams.forEach((stream, i) => {
        for (const key of ['isTTY', 'columns']) {
          if (saved[i][key]) Object.defineProperty(stream, key, saved[i][key])
          else delete stream[key]
        }
      })
    }
    expect(getGlobalRendererSettings().isInteractive).toBe(false)
    expect(getColorSettingsForTests()).toEqual({
      chalkLevel: 3,
      colorSupportLevel: 3,
    })
    expect(style.error('boom')).not.toBe('boom')
  })

  test('no agent → colours unchanged', () => {
    applyAgentSession({ agent: { isAgent: false }, env: {} })
    expect(style.error('boom')).not.toBe('boom')
    expect(logObject()).toContain(ESC)
    expect(getColorSettingsForTests()).toEqual({
      chalkLevel: 3,
      colorSupportLevel: 3,
    })
  })

  test('no agent result at all → colours unchanged', () => {
    applyAgentSession({ agent: undefined, env: {} })
    expect(style.error('boom')).not.toBe('boom')
    expect(logObject()).toContain(ESC)
  })

  // jest's streams are pipes, so chalk found no colour support at load; logged objects are still
  // coloured without an agent (util.inspect colours follow the logger's own fallback level).
  test('no agent, colour levels as loaded → logged objects keep their colours', () => {
    setColorSettingsForTests(LOADED_COLORS)
    applyAgentSession({ agent: { isAgent: false }, env: {} })
    expect(logObject()).toContain(ESC)
  })
})

describe('applyAgentSession with odd input', () => {
  let savedEnv
  beforeEach(() => {
    savedEnv = process.env
    process.env = { ...savedEnv }
    delete process.env.FORCE_COLOR
    delete process.env.SLS_INTERACTIVE_SETUP_ENABLE
  })
  afterEach(() => {
    process.env = savedEnv
  })

  test('no options or null options → nothing changes, nothing throws', () => {
    setGlobalRendererSettings({ isInteractive: true })
    expect(() => applyAgentSession()).not.toThrow()
    expect(() => applyAgentSession(null)).not.toThrow()
    expect(getGlobalRendererSettings().isInteractive).toBe(true)
    expect(style.error('boom')).not.toBe('boom')
  })

  test('agent with a null env → the process environment applies', () => {
    expect(() => applyAgentSession({ agent: CLAUDE, env: null })).not.toThrow()
    expect(getGlobalRendererSettings().isInteractive).toBe(false)
    expect(style.error('boom')).toBe('boom')
  })
})

// applyAgentSession is what sf-core's run() calls after detectAgent(), before the first spinner.
// It may only ever turn renderer interactivity OFF, and only for a detected agent. env is passed
// explicitly with no SLS_INTERACTIVE_SETUP_ENABLE; with isAgent: true computeIsInteractive then
// returns false on any stream, so these cases do not depend on the runner's terminal.
describe('applyAgentSession interactivity', () => {
  test('no agent: renderer interactivity is left untouched', () => {
    setGlobalRendererSettings({ isInteractive: true })
    applyAgentSession({ agent: { isAgent: false, name: undefined }, env: {} })
    expect(getGlobalRendererSettings().isInteractive).toBe(true)
  })

  test('a missing agent result is treated as no agent', () => {
    setGlobalRendererSettings({ isInteractive: true })
    applyAgentSession({ env: {} })
    expect(getGlobalRendererSettings().isInteractive).toBe(true)
  })

  test('agent: the renderer becomes non-interactive', () => {
    setGlobalRendererSettings({ isInteractive: true })
    applyAgentSession({ agent: { isAgent: true, name: 'gemini' }, env: {} })
    expect(getGlobalRendererSettings().isInteractive).toBe(false)
  })
})

describe('shouldDisableColors', () => {
  let savedEnv
  beforeEach(() => {
    savedEnv = process.env
    resetAgentDetectionForTests()
  })
  afterEach(() => {
    process.env = savedEnv
    resetAgentDetectionForTests()
  })

  test('false before detection has run (no agent)', () => {
    expect(shouldDisableColors({ env: {} })).toBe(false)
  })

  test('true for a detected agent without FORCE_COLOR', async () => {
    process.env = { ...savedEnv, AI_AGENT: 'claude-code_2-1-284_agent' }
    await detectAgent()
    expect(shouldDisableColors({ env: {} })).toBe(true)
  })

  test('false for a detected agent with FORCE_COLOR set (even empty)', async () => {
    process.env = { ...savedEnv, AI_AGENT: 'claude-code_2-1-284_agent' }
    await detectAgent()
    expect(shouldDisableColors({ env: { FORCE_COLOR: '' } })).toBe(false)
    expect(shouldDisableColors({ env: { FORCE_COLOR: '1' } })).toBe(false)
  })

  test('false for a detected agent with SLS_INTERACTIVE_SETUP_ENABLE', async () => {
    process.env = { ...savedEnv, AI_AGENT: 'claude-code_2-1-284_agent' }
    await detectAgent()
    expect(
      shouldDisableColors({ env: { SLS_INTERACTIVE_SETUP_ENABLE: '1' } }),
    ).toBe(false)
    expect(
      shouldDisableColors({ env: { SLS_INTERACTIVE_SETUP_ENABLE: '' } }),
    ).toBe(true)
  })

  test.each([[null], ['FORCE_COLOR=1'], [42]])(
    'env %p falls back to the process environment',
    async (env) => {
      process.env = { ...savedEnv, AI_AGENT: 'claude-code_2-1-284_agent' }
      delete process.env.FORCE_COLOR
      delete process.env.SLS_INTERACTIVE_SETUP_ENABLE
      await detectAgent()
      expect(shouldDisableColors({ env })).toBe(true)
      process.env.FORCE_COLOR = '1'
      expect(shouldDisableColors({ env })).toBe(false)
    },
  )

  test('a null options object never throws', () => {
    expect(() => shouldDisableColors(null)).not.toThrow()
    expect(shouldDisableColors(null)).toBe(false)
  })

  test('reads process.env by default', async () => {
    process.env = { ...savedEnv, AI_AGENT: 'claude-code_2-1-284_agent' }
    delete process.env.FORCE_COLOR
    delete process.env.SLS_INTERACTIVE_SETUP_ENABLE
    await detectAgent()
    expect(shouldDisableColors()).toBe(true)
    process.env.FORCE_COLOR = '1'
    expect(shouldDisableColors()).toBe(false)
    delete process.env.FORCE_COLOR
    process.env.SLS_INTERACTIVE_SETUP_ENABLE = '1'
    expect(shouldDisableColors()).toBe(false)
  })
})
