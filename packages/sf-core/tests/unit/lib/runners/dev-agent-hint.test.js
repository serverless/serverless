// Importing router.js first resolves a pre-existing circular-import ordering issue (see
// compose/dev-selectors.test.js).
import '../../../../src/lib/router.js'
import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { detectAgent, log, resetAgentDetectionForTests } from '@serverless/util'
import { AGENT_HINT } from '@serverless/framework/lib/plugins/aws/dev/attach/output.js'
import {
  devAgentHint,
  TraditionalRunner,
} from '../../../../src/lib/runners/framework.js'

const config = {
  service: 'orders',
  functions: { api: { handler: 'api.handler' } },
}
const hintFor = (fields) =>
  devAgentHint({
    command: ['dev'],
    options: {},
    config,
    isAgent: () => true,
    ...fields,
  })

describe('the agent hint of serverless dev', () => {
  test('an agent starting a session in this terminal gets the exact hint', () => {
    expect(hintFor({})).toBe(AGENT_HINT)
    expect(AGENT_HINT).toBe(
      'Running under an AI agent: start with "serverless dev --detach", then use "serverless dev wait" and "serverless dev stop" (which restores your functions).',
    )
  })

  test('a --config the command was given goes with every command', () => {
    expect(hintFor({ options: { config: 'sub/serverless.yml' } })).toBe(
      'Running under an AI agent: start with "serverless dev --detach --config sub/serverless.yml", then use "serverless dev wait --config sub/serverless.yml" and "serverless dev stop --config sub/serverless.yml" (which restores your functions).',
    )
    expect(
      hintFor({
        compose: {
          isWithinCompose: true,
          serviceName: 'consumer',
          configFile: 'compose/shop.yml',
        },
      }),
    ).toBe(
      'Running under an AI agent: start with "serverless consumer dev --detach --config compose/shop.yml", then use "serverless consumer dev wait --config compose/shop.yml" and "serverless consumer dev stop --config compose/shop.yml" (which restores your functions).',
    )
  })

  test('a service started from a Compose root is named in every command', () => {
    expect(
      hintFor({
        compose: { isWithinCompose: true, serviceName: 'consumer' },
      }),
    ).toBe(
      'Running under an AI agent: start with "serverless consumer dev --detach", then use "serverless consumer dev wait" and "serverless consumer dev stop" (which restores your functions).',
    )
  })

  test('a service whose only functions are MCP servers gets the hint', () => {
    expect(
      hintFor({
        config: {
          service: 'orders',
          mcp: { servers: { crm: { server: 'src/server.mjs' } } },
        },
      }),
    ).toBe(AGENT_HINT)
  })

  test.each([
    ['a person', { isAgent: () => false }],
    ['--help', { options: { help: true } }],
    ['-h', { options: { h: true } }],
    ['--detach', { options: { detach: true } }],
    ['--dry-run', { options: { 'dry-run': true } }],
    ['the session process', { options: { 'session-process': true } }],
    ['--mode agents', { options: { mode: 'agents' } }],
    ['--mode sandboxes', { options: { mode: 'sandboxes' } }],
    ['--sandbox', { options: { sandbox: 'box' } }],
    [
      'a configuration without functions (agents or sandboxes mode)',
      { config: { service: 'orders' } },
    ],
    ['another dev command', { command: ['dev', 'wait'] }],
    ['another command', { command: ['deploy'] }],
  ])('no hint for %s', (_, fields) => {
    expect(hintFor(fields)).toBeNull()
  })

  test('agent detection is not asked when the run is not a foreground session', () => {
    const isAgent = () => {
      throw new Error('asked')
    }
    expect(hintFor({ isAgent, options: { detach: true } })).toBeNull()
  })
})

describe('the runner prints the agent hint', () => {
  const VARIABLES = ['AI_AGENT', 'SLS_INTERACTIVE_SETUP_ENABLE', 'CI']
  const saved = Object.fromEntries(
    VARIABLES.map((name) => [name, process.env[name]]),
  )
  afterEach(() => {
    for (const name of VARIABLES) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    resetAgentDetectionForTests()
    jest.restoreAllMocks()
  })

  // Runs `serverless dev` up to the sign-in, under the given variables, and returns what was
  // printed before it.
  const linesBeforeSignIn = async (env) => {
    for (const name of VARIABLES) delete process.env[name]
    Object.assign(process.env, env)
    resetAgentDetectionForTests()
    await detectAgent()
    const order = []
    jest
      .spyOn(log.get('traditional'), 'notice')
      .mockImplementation((line) => order.push(line))
    const stop = new Error('stopped after sign-in')
    const runner = {
      command: ['dev'],
      options: {},
      config,
      stage: 'dev',
      resolveVariablesAndAuthenticate: async () => {
        order.push('sign-in')
        throw stop
      },
    }
    await expect(TraditionalRunner.prototype.run.call(runner)).rejects.toBe(
      stop,
    )
    return order
  }

  test('before sign-in and variable resolution', async () => {
    expect(
      await linesBeforeSignIn({ AI_AGENT: 'claude-code_test_agent' }),
    ).toEqual([AGENT_HINT, 'sign-in'])
  })

  test('also in CI, when an agent runs it', async () => {
    expect(
      await linesBeforeSignIn({
        AI_AGENT: 'claude-code_test_agent',
        CI: 'true',
      }),
    ).toEqual([AGENT_HINT, 'sign-in'])
  })

  test('not for a person taken for an agent who set SLS_INTERACTIVE_SETUP_ENABLE', async () => {
    expect(
      await linesBeforeSignIn({
        AI_AGENT: 'claude-code_test_agent',
        SLS_INTERACTIVE_SETUP_ENABLE: '1',
      }),
    ).toEqual(['sign-in'])
  })
})
