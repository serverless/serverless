// Agent detection wraps @vercel/detect-agent. Every environment variable the library reads is
// cleared before each test so results never depend on the harness running jest (Claude Code,
// Cursor, Codex, ... all set some of them). The library also treats an existing `/opt/.devin`
// as Devin, so the one test that expects "no agent" from a clean environment is skipped on a
// machine where that path exists.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'
import {
  detectAgent,
  getDetectedAgent,
  KNOWN_AGENT_NAMES,
  normalizeAgentName,
  resetAgentDetectionForTests,
} from '@serverless/util/src/agent/index.js'
import { clearAgentEnv, hasDevinMarker } from './agent-env.js'

const testWithoutDevinMarker = hasDevinMarker() ? test.skip : test

let restoreEnv
beforeEach(() => {
  restoreEnv = clearAgentEnv()
  resetAgentDetectionForTests()
})
afterEach(() => {
  restoreEnv()
  resetAgentDetectionForTests()
})

testWithoutDevinMarker('no agent variables → not an agent', async () => {
  expect(await detectAgent()).toEqual({ isAgent: false, name: undefined })
})

test.each([
  [{ CLAUDECODE: '1' }, 'claude'],
  [{ CLAUDE_CODE: '1' }, 'claude'],
  [{ CLAUDECODE: '1', CLAUDE_CODE_IS_COWORK: '1' }, 'cowork'],
  [{ CODEX_CI: '1' }, 'codex'],
  [{ CODEX_SANDBOX: 'seatbelt' }, 'codex'],
  [{ CODEX_THREAD_ID: 't1' }, 'codex'],
  [{ GEMINI_CLI: '1' }, 'gemini'],
  [{ CURSOR_AGENT: '1' }, 'cursor-cli'],
  [{ CURSOR_EXTENSION_HOST_ROLE: 'agent-exec' }, 'cursor-cli'],
  [{ CURSOR_TRACE_ID: 'abc' }, 'cursor'],
  [{ ANTIGRAVITY_AGENT: '1' }, 'antigravity'],
  [{ AUGMENT_AGENT: '1' }, 'augment-cli'],
  [{ OPENCODE_CLIENT: 'x' }, 'opencode'],
  [{ COPILOT_ALLOW_ALL: '1' }, 'github-copilot'],
  [{ AI_AGENT: 'claude-code_2-1-284_agent' }, 'claude'],
  [{ AI_AGENT: 'github-copilot-cli' }, 'github-copilot'],
  [{ AI_AGENT: 'github_copilot_vscode_agent' }, 'github-copilot'],
  [{ AI_AGENT: 'v0' }, 'v0'],
  [{ AI_AGENT: 'devin_2026_agent' }, 'devin'],
  [{ AI_AGENT: 'my-internal-bot v2' }, 'other'],
])('%j → %s', async (env, name) => {
  Object.assign(process.env, env)
  expect(await detectAgent()).toEqual({ isAgent: true, name })
})

test('REPL_ID alone is ignored (set in every Replit shell)', async () => {
  process.env.REPL_ID = 'r1'
  expect(await detectAgent()).toEqual({ isAgent: false, name: undefined })
})

test('REPL_ID with AI_AGENT counts', async () => {
  process.env.REPL_ID = 'r1'
  process.env.AI_AGENT = 'replit'
  expect(await detectAgent()).toEqual({ isAgent: true, name: 'replit' })
})

test('COPILOT_GITHUB_TOKEN alone is ignored (developers export it)', async () => {
  process.env.COPILOT_GITHUB_TOKEN = 't'
  expect(await detectAgent()).toEqual({ isAgent: false, name: undefined })
})

test('COPILOT_MODEL counts as Copilot', async () => {
  process.env.COPILOT_MODEL = 'm'
  expect(await detectAgent()).toEqual({ isAgent: true, name: 'github-copilot' })
})

test.each([
  [{ COPILOT_GITHUB_TOKEN: 't', COPILOT_MODEL: 'm' }],
  [{ COPILOT_GITHUB_TOKEN: 't', COPILOT_ALLOW_ALL: '1' }],
])('%j → github-copilot (token with a Copilot agent variable)', async (env) => {
  Object.assign(process.env, env)
  expect(await detectAgent()).toEqual({ isAgent: true, name: 'github-copilot' })
})

test('a blank AI_AGENT does not rescue REPL_ID', async () => {
  process.env.AI_AGENT = ' '
  process.env.REPL_ID = 'r1'
  expect(await detectAgent()).toEqual({ isAgent: false, name: undefined })
})

test('result is cached; getDetectedAgent returns it synchronously', async () => {
  process.env.CLAUDECODE = '1'
  await detectAgent()
  delete process.env.CLAUDECODE
  expect(getDetectedAgent()).toEqual({ isAgent: true, name: 'claude' })
  expect(await detectAgent()).toEqual({ isAgent: true, name: 'claude' })
})

test('getDetectedAgent before detection → not an agent', () => {
  expect(getDetectedAgent()).toEqual({ isAgent: false, name: undefined })
})

test('normalizeAgentName maps known prefixes and falls back to other', () => {
  expect(normalizeAgentName('Cursor-CLI')).toBe('cursor-cli')
  expect(normalizeAgentName('github-copilot-cli')).toBe('github-copilot')
  expect(normalizeAgentName('copilot_cli')).toBe('github-copilot')
  expect(normalizeAgentName('claudette')).toBe('other')
  expect(normalizeAgentName('v0')).toBe('v0')
  expect(normalizeAgentName('cowork')).toBe('cowork')
  expect(normalizeAgentName('')).toBe('other')
})

test('every known name normalizes to itself', () => {
  for (const name of KNOWN_AGENT_NAMES) {
    expect(normalizeAgentName(name)).toBe(name)
  }
})

// Last in the file: resets the module registry and re-imports the detector against a mocked
// library. The static imports above keep their original bindings.
test('library failure → not an agent, never throws', async () => {
  jest.resetModules()
  jest.unstable_mockModule('@vercel/detect-agent', () => ({
    determineAgent: async () => {
      throw new Error('boom')
    },
  }))
  const mod = await import('@serverless/util/src/agent/index.js')
  mod.resetAgentDetectionForTests()
  process.env.CLAUDECODE = '1'
  await expect(mod.detectAgent()).resolves.toEqual({
    isAgent: false,
    name: undefined,
  })
})
