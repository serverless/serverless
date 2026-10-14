// NO_COLOR (https://no-color.org) across the CLI: one rule, shouldDisableColors, decides colour for
// every chalk instance and every other colour decision. Precedence: FORCE_COLOR (0 or false → off,
// any other value → on, as chalk reads it) > NO_COLOR (non-empty) > AI agent detection > the
// terminal's own support. The logger applies it at startup through applyAgentSession, for every
// session, not only an agent's.
//
// ora (the spinner) and enquirer (prompts) carry their own colour libraries, which only read
// FORCE_COLOR. Both are mocked here to record the options the logger passes them; every test
// starts from a colour-capable logger and restores the levels afterwards. The caller's NO_COLOR,
// FORCE_COLOR and agent variables are removed so the shell running the suite never decides.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'

const ESC = '\u001b['
const CLAUDE = { isAgent: true, name: 'claude' }
const NO_AGENT = { isAgent: false, name: undefined }

const oraCalls = []
jest.unstable_mockModule('ora', () => ({
  default: (options) => {
    oraCalls.push(options)
    const spinner = {
      isSpinning: false,
      text: options.text,
      start: () => {
        spinner.isSpinning = true
        return spinner
      },
      stop: () => {
        spinner.isSpinning = false
        return spinner
      },
    }
    return spinner
  },
}))

const promptCalls = []
jest.unstable_mockModule('enquirer', () => ({
  default: class {
    async prompt(options) {
      promptCalls.push(options)
      return { [options.name]: true }
    }
  },
}))

const {
  applyAgentSession,
  getColorSettingsForTests,
  getGlobalRendererSettings,
  log,
  progress,
  setColorSettingsForTests,
  setGlobalRendererSettings,
  style,
} = await import('@serverless/util/src/logger/index.js')
const { resetAgentDetectionForTests, shouldDisableColors } =
  await import('@serverless/util/src/agent/index.js')

const CALLER_VARIABLES = [
  'NO_COLOR',
  'FORCE_COLOR',
  'SLS_INTERACTIVE_SETUP_ENABLE',
  'AI_AGENT',
]

let savedProcessEnv
beforeAll(() => {
  savedProcessEnv = process.env
  process.env = { ...savedProcessEnv }
  for (const name of CALLER_VARIABLES) delete process.env[name]
})
afterAll(() => {
  process.env = savedProcessEnv
})

let savedColors
let savedRenderer
beforeEach(() => {
  savedColors = getColorSettingsForTests()
  savedRenderer = getGlobalRendererSettings()
  // Truecolor, as in a real terminal; jest's own streams are pipes.
  setColorSettingsForTests({ chalkLevel: 3, colorSupportLevel: 3 })
  resetAgentDetectionForTests()
})
afterEach(() => {
  setColorSettingsForTests(savedColors)
  setGlobalRendererSettings(savedRenderer)
  resetAgentDetectionForTests()
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
  captureStdErr(() => log.get('no-color').notice({ count: 1 }))

const COLOURS_ON = { chalkLevel: 3, colorSupportLevel: 3 }
const COLOURS_OFF = { chalkLevel: 0, colorSupportLevel: 0 }

describe('shouldDisableColors', () => {
  test.each(
    [
      ['NO_COLOR=1, no agent', { NO_COLOR: '1' }, NO_AGENT, true],
      ['NO_COLOR=true, no agent', { NO_COLOR: 'true' }, NO_AGENT, true],
      [
        'NO_COLOR=0 (any non-empty value), no agent',
        { NO_COLOR: '0' },
        NO_AGENT,
        true,
      ],
      ['an empty NO_COLOR, no agent', { NO_COLOR: '' }, NO_AGENT, false],
      ['nothing set, no agent', {}, NO_AGENT, false],
      [
        'FORCE_COLOR=1 over NO_COLOR',
        { FORCE_COLOR: '1', NO_COLOR: '1' },
        NO_AGENT,
        false,
      ],
      [
        'an empty FORCE_COLOR over NO_COLOR',
        { FORCE_COLOR: '', NO_COLOR: '1' },
        NO_AGENT,
        false,
      ],
      [
        'FORCE_COLOR over NO_COLOR and an agent',
        { FORCE_COLOR: '1', NO_COLOR: '1' },
        CLAUDE,
        false,
      ],
      ['FORCE_COLOR=0, no agent', { FORCE_COLOR: '0' }, NO_AGENT, true],
      ['FORCE_COLOR=false, no agent', { FORCE_COLOR: 'false' }, NO_AGENT, true],
      // As chalk reads FORCE_COLOR: only the exact 'false', or a value parseInt reads as 0.
      [
        'FORCE_COLOR=FALSE, no agent',
        { FORCE_COLOR: 'FALSE' },
        NO_AGENT,
        false,
      ],
      ['FORCE_COLOR=00, no agent', { FORCE_COLOR: '00' }, NO_AGENT, true],
      ['FORCE_COLOR=" 0", no agent', { FORCE_COLOR: ' 0' }, NO_AGENT, true],
      ['FORCE_COLOR=0abc, no agent', { FORCE_COLOR: '0abc' }, NO_AGENT, true],
      [
        'FORCE_COLOR=abc with NO_COLOR',
        { FORCE_COLOR: 'abc', NO_COLOR: '1' },
        NO_AGENT,
        false,
      ],
      [
        'FORCE_COLOR=0 with NO_COLOR',
        { FORCE_COLOR: '0', NO_COLOR: '1' },
        NO_AGENT,
        true,
      ],
      [
        'FORCE_COLOR=false with NO_COLOR',
        { FORCE_COLOR: 'false', NO_COLOR: '1' },
        NO_AGENT,
        true,
      ],
      [
        'FORCE_COLOR=0 with SLS_INTERACTIVE_SETUP_ENABLE and an agent',
        { FORCE_COLOR: '0', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
        CLAUDE,
        true,
      ],
      ['an agent without FORCE_COLOR', {}, CLAUDE, true],
      ['an agent with an empty NO_COLOR', { NO_COLOR: '' }, CLAUDE, true],
      [
        'an agent with SLS_INTERACTIVE_SETUP_ENABLE',
        { SLS_INTERACTIVE_SETUP_ENABLE: '1' },
        CLAUDE,
        false,
      ],
      // The override restores a person's session for a wrongly detected one; NO_COLOR is the
      // person's own choice and still applies.
      [
        'NO_COLOR with SLS_INTERACTIVE_SETUP_ENABLE',
        { NO_COLOR: '1', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
        NO_AGENT,
        true,
      ],
      [
        'NO_COLOR with SLS_INTERACTIVE_SETUP_ENABLE and an agent',
        { NO_COLOR: '1', SLS_INTERACTIVE_SETUP_ENABLE: '1' },
        CLAUDE,
        true,
      ],
    ].map(([label, env, agent, off]) => [
      `${label} → colours ${off ? 'off' : 'on'}`,
      env,
      agent,
      off,
    ]),
  )('%s', (_, env, agent, expected) => {
    expect(shouldDisableColors({ env, agent })).toBe(expected)
  })

  test('NO_COLOR in the process environment applies without a detected agent', () => {
    process.env.NO_COLOR = '1'
    try {
      expect(shouldDisableColors()).toBe(true)
      process.env.FORCE_COLOR = '1'
      expect(shouldDisableColors()).toBe(false)
    } finally {
      delete process.env.NO_COLOR
      delete process.env.FORCE_COLOR
    }
  })
})

describe('applyAgentSession applies NO_COLOR to every session', () => {
  test('NO_COLOR=1 on a colour-capable terminal → no escape codes', () => {
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '1' } })
    expect(getColorSettingsForTests()).toEqual(COLOURS_OFF)
    expect(style.error('boom')).toBe('boom')
    expect(style.warning('boom')).toBe('boom')
    expect(style.title('boom')).toBe('boom')
    const output = logObject()
    expect(output).toContain('count: 1')
    expect(output).not.toContain(ESC)
  })

  test('NO_COLOR=1 with no agent result at all → no escape codes', () => {
    applyAgentSession({ env: { NO_COLOR: '1' } })
    expect(getColorSettingsForTests()).toEqual(COLOURS_OFF)
  })

  test('NO_COLOR from the process environment → no escape codes', () => {
    process.env.NO_COLOR = '1'
    try {
      applyAgentSession({ agent: NO_AGENT })
    } finally {
      delete process.env.NO_COLOR
    }
    expect(getColorSettingsForTests()).toEqual(COLOURS_OFF)
  })

  test('an empty NO_COLOR → colours stay', () => {
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '' } })
    expect(getColorSettingsForTests()).toEqual(COLOURS_ON)
    expect(style.error('boom')).not.toBe('boom')
    expect(logObject()).toContain(ESC)
  })

  test.each([['1'], [''], ['true']])(
    'FORCE_COLOR=%j with NO_COLOR → colours stay as chalk set them',
    (value) => {
      applyAgentSession({
        agent: NO_AGENT,
        env: { FORCE_COLOR: value, NO_COLOR: '1' },
      })
      expect(getColorSettingsForTests()).toEqual(COLOURS_ON)
      expect(style.error('boom')).not.toBe('boom')
      expect(logObject()).toContain(ESC)
    },
  )

  // FORCE_COLOR=0 or false is the user asking for no colour: chalk already reads it so, and the
  // rule makes util.inspect, the spinner and prompts agree, NO_COLOR or not.
  test.each([
    [{ FORCE_COLOR: '0' }],
    [{ FORCE_COLOR: 'false' }],
    [{ FORCE_COLOR: '0', NO_COLOR: '1' }],
    [{ FORCE_COLOR: 'false', NO_COLOR: '1' }],
  ])('%p → no escape codes, logged objects included', (env) => {
    applyAgentSession({ agent: NO_AGENT, env })
    expect(getColorSettingsForTests()).toEqual(COLOURS_OFF)
    expect(style.error('boom')).toBe('boom')
    const output = logObject()
    expect(output).toContain('count: 1')
    expect(output).not.toContain(ESC)
  })

  test('an agent without FORCE_COLOR → no escape codes (unchanged)', () => {
    applyAgentSession({ agent: CLAUDE, env: {} })
    expect(getColorSettingsForTests()).toEqual(COLOURS_OFF)
    expect(style.error('boom')).toBe('boom')
  })

  test('NO_COLOR leaves the session of a person interactive', () => {
    setGlobalRendererSettings({ isInteractive: true })
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '1' } })
    expect(getGlobalRendererSettings().isInteractive).toBe(true)
  })
})

describe('the spinner and prompts follow the rule', () => {
  let savedIsTTY
  beforeEach(() => {
    savedIsTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')
    Object.defineProperty(process.stderr, 'isTTY', {
      value: true,
      configurable: true,
    })
    setGlobalRendererSettings({ isInteractive: true, logLevel: 'notice' })
    promptCalls.length = 0
  })
  afterEach(() => {
    progress.get('no-color').remove()
    if (savedIsTTY) Object.defineProperty(process.stderr, 'isTTY', savedIsTTY)
    else delete process.stderr.isTTY
  })

  // ora colours its frame with its own chalk instance, which ignores NO_COLOR. The spinner is
  // created once per process, after the rule was applied, so this test must create it.
  test('NO_COLOR=1 → the spinner is created without a colour', () => {
    const before = oraCalls.length
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '1' } })
    captureStdErr(() => progress.get('no-color').notice('Working'))
    expect(oraCalls).toHaveLength(before + 1)
    expect(oraCalls.at(-1).color).toBe(false)
    expect(oraCalls.at(-1).text).not.toContain(ESC)
  })

  // enquirer styles everything but the logger's own overrides with ansi-colors, which ignores
  // NO_COLOR; `styles.enabled: false` turns it off.
  test.each([
    ['confirm', () => log.confirm({ message: 'Go?' })],
    ['input', () => log.input({ message: 'Name?' })],
    [
      'choose',
      () => log.choose({ message: 'Pick', choices: [{ name: 'a', value: 1 }] }),
    ],
    [
      'checkbox',
      () =>
        log.checkbox({ message: 'Pick', choices: [{ name: 'a', value: 1 }] }),
    ],
  ])('NO_COLOR=1 → the %s prompt has colours off', async (_, ask) => {
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '1' } })
    await ask()
    expect(promptCalls).toHaveLength(1)
    expect(promptCalls[0].styles.enabled).toBe(false)
    expect(promptCalls[0].styles.primary('x')).toBe('x')
  })

  // ansi-colors reads FORCE_COLOR=0 itself but not FORCE_COLOR=false.
  test('FORCE_COLOR=false → the prompt has colours off', async () => {
    applyAgentSession({ agent: NO_AGENT, env: { FORCE_COLOR: 'false' } })
    await log.confirm({ message: 'Go?' })
    expect(promptCalls[0].styles.enabled).toBe(false)
  })

  // Without the rule, enquirer keeps its own default (which honours FORCE_COLOR=0): the logger
  // never turns its colours on.
  test('colours on → the prompt keeps the enquirer default', async () => {
    applyAgentSession({ agent: NO_AGENT, env: {} })
    await log.confirm({ message: 'Go?' })
    expect(promptCalls[0].styles).not.toHaveProperty('enabled')
    expect(promptCalls[0].styles.primary('x')).not.toBe('x')
  })
})

describe('the success style', () => {
  test('colours an outcome that went well, and nothing once the rule turns colours off', () => {
    expect(style.success('(202)')).toContain(ESC)
    applyAgentSession({ agent: NO_AGENT, env: { NO_COLOR: '1' } })
    expect(style.success('(202)')).toBe('(202)')
  })

  // A success line keeps its default colour: only its mark is coloured.
  test('does not colour the text of a success line', () => {
    const line = captureStdErr(() => log.get('no-color').success('Deployed'))
    expect(line).toContain('Deployed')
    expect(line).not.toContain(style.success('Deployed'))
  })
})

describe('the blank line above a spinner', () => {
  // The spinner keeps one blank line above itself (on stderr, where it draws). A blank line the
  // caller wrote already is that line, so a section break never doubles.
  const blanksBeforeSpinner = (write) => {
    const savedTty = process.stderr.isTTY
    const savedRenderer = getGlobalRendererSettings()
    const chunks = []
    const stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => (chunks.push(String(chunk)), true))
    process.stderr.isTTY = true
    setGlobalRendererSettings({ isInteractive: true })
    try {
      write()
      const before = chunks.length
      progress.get('blank-line-test').notice('Working')
      return chunks.slice(before).filter((text) => text === '\n').length
    } finally {
      progress.get('blank-line-test').remove()
      stderrWrite.mockRestore()
      process.stderr.isTTY = savedTty
      setGlobalRendererSettings(savedRenderer)
    }
  }

  test('a line before the spinner gets one blank line after it', () => {
    expect(blanksBeforeSpinner(() => log.get('no-color').notice('a'))).toBe(1)
  })

  test('a blank line before the spinner is the one: none is added', () => {
    expect(
      blanksBeforeSpinner(() => {
        log.get('no-color').notice('a')
        log.get('no-color').blankLine()
      }),
    ).toBe(0)
  })
})
