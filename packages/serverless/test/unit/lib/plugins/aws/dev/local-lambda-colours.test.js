// Objects a handler logs during a `serverless dev` local invocation are formatted by the runtime
// wrapper with util.inspect. For an AI coding agent (no FORCE_COLOR, no
// SLS_INTERACTIVE_SETUP_ENABLE) they must carry no colour codes; everyone else keeps the
// coloured formatting.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import {
  getColorSettingsForTests,
  setColorSettingsForTests,
} from '@serverless/util/src/logger/index.js'
import {
  detectAgent,
  resetAgentDetectionForTests,
} from '@serverless/util/src/agent/index.js'

const { default: LocalLambda } =
  await import('../../../../../../lib/plugins/aws/dev/local-lambda/index.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(here, 'fixtures')
const wrapperPath = path.resolve(
  here,
  '../../../../../../lib/plugins/aws/dev/local-lambda/runtime-wrappers/node.js',
)
const ESC = '\u001b['
const AGENT = 'claude-code_2-1-284_agent'

describe('node runtime wrapper object formatting', () => {
  let tmpDir
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-local-colours-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Runs the wrapper as LocalLambda does and returns its stdout and the saved result.
  const runWrapper = (extraEnv) =>
    new Promise((resolve, reject) => {
      const env = { ...process.env, TMPDIR: tmpDir }
      delete env.SLS_DEV_PLAIN_OUTPUT
      Object.assign(env, extraEnv)
      const child = spawn(
        process.execPath,
        [
          wrapperPath,
          JSON.stringify({
            handlerFileAbsolutePath: path.join(fixturesDir, 'log-object.mjs'),
            handlerName: 'handler',
            event: {},
            partialContext: { timeout: 6 },
          }),
        ],
        { env, cwd: fixturesDir },
      )
      let stdout = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.on('error', reject)
      child.on('close', () => {
        const result = JSON.parse(
          fs.readFileSync(path.join(tmpDir, `sls_${child.pid}.json`), 'utf8'),
        )
        resolve({ stdout, result })
      })
    })

  it('formats logged objects without colour codes when SLS_DEV_PLAIN_OUTPUT is set', async () => {
    const { stdout, result } = await runWrapper({ SLS_DEV_PLAIN_OUTPUT: '1' })
    expect(stdout).toContain('nested: { ok: true, count: 1 }')
    expect(stdout).toContain('viaWrite: true')
    expect(stdout).not.toContain(ESC)
    // The flag is the wrapper's, not part of the function's environment.
    expect(result).toEqual({ response: { sawFlag: null }, error: null })
  })

  it('keeps the coloured formatting without SLS_DEV_PLAIN_OUTPUT', async () => {
    const { stdout, result } = await runWrapper({})
    expect(stdout).toContain(ESC)
    expect(stripVTControlCharacters(stdout)).toContain(
      'nested: { ok: true, count: 1 }',
    )
    expect(result).toEqual({ response: { sawFlag: null }, error: null })
  })
})

describe('LocalLambda child environment', () => {
  let savedEnv
  let savedColors
  beforeEach(() => {
    savedEnv = process.env
    savedColors = getColorSettingsForTests()
    // The logger itself adds no colour here, so any escape code comes from the child.
    setColorSettingsForTests({ chalkLevel: 0, colorSupportLevel: 0 })
    resetAgentDetectionForTests()
  })
  afterEach(() => {
    process.env = savedEnv
    setColorSettingsForTests(savedColors)
    resetAgentDetectionForTests()
  })

  const detectWith = async (env) => {
    process.env = { ...savedEnv, ...env }
    for (const name of ['FORCE_COLOR', 'SLS_INTERACTIVE_SETUP_ENABLE']) {
      if (!(name in env)) delete process.env[name]
    }
    delete process.env.SLS_DEV_PLAIN_OUTPUT
    await detectAgent()
  }

  // Invokes the fixture through LocalLambda and returns what was logged for the invocation.
  const invokeAndCapture = async () => {
    const localLambda = new LocalLambda({
      serviceAbsolutePath: fixturesDir,
      handler: 'log-object.handler',
      runtime: 'nodejs24.x',
      invocationColorFn: (s) => s,
    })
    const written = []
    const original = process.stderr.write
    process.stderr.write = (chunk) => {
      written.push(String(chunk))
      return true
    }
    let result
    try {
      result = await localLambda.invoke({}, { timeout: 6 })
    } finally {
      process.stderr.write = original
    }
    return { logged: written.join(''), result }
  }

  it('asks the wrapper for plain output for a detected agent', async () => {
    await detectWith({ AI_AGENT: AGENT })
    const { logged, result } = await invokeAndCapture()
    expect(logged).toContain('nested: { ok: true, count: 1 }')
    expect(logged).not.toContain(ESC)
    expect(result).toEqual({ response: { sawFlag: null }, error: null })
  })

  it('keeps coloured output without an agent', async () => {
    const { logged } = await invokeAndCapture()
    expect(logged).toContain(ESC)
  })

  it('keeps coloured output for a detected agent with FORCE_COLOR', async () => {
    await detectWith({ AI_AGENT: AGENT, FORCE_COLOR: '1' })
    const { logged } = await invokeAndCapture()
    expect(logged).toContain(ESC)
  })

  it('keeps coloured output for a detected agent with SLS_INTERACTIVE_SETUP_ENABLE', async () => {
    await detectWith({ AI_AGENT: AGENT, SLS_INTERACTIVE_SETUP_ENABLE: '1' })
    const { logged } = await invokeAndCapture()
    expect(logged).toContain(ESC)
  })
})
