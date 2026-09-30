import { createAnalysisEvent } from '../../../../src/lib/router.js'
import { detectAgent, resetAgentDetectionForTests } from '@serverless/util'
// Shared with the framework's agent tests: the detector's variables, cleared per case.
import {
  clearAgentEnv,
  hasDevinMarker,
} from '../../../../../serverless/test/unit/lib/util/agent-env.js'

const testWithoutDevinMarker = hasDevinMarker() ? test.skip : test

const base = {
  licenseKey: null,
  orgId: 'o',
  versionFramework: '4.99.0',
  command: ['deploy'],
  cliOptions: {},
  resolvers: [],
}

let restoreEnv
beforeEach(() => {
  restoreEnv = clearAgentEnv()
  resetAgentDetectionForTests()
})
afterEach(() => {
  restoreEnv()
  resetAgentDetectionForTests()
})

testWithoutDevinMarker('no agent → no agent field', async () => {
  await detectAgent()
  expect(createAnalysisEvent(base)).not.toHaveProperty('agent')
})

test('known agent → normalised name', async () => {
  process.env.AI_AGENT = 'claude-code_2-1-284_agent'
  await detectAgent()
  expect(createAnalysisEvent(base).agent).toBe('claude')
})

test('arbitrary AI_AGENT text → other, raw value never sent', async () => {
  process.env.AI_AGENT = 'my-internal-bot v2'
  await detectAgent()
  const event = createAnalysisEvent(base)
  expect(event.agent).toBe('other')
  expect(JSON.stringify(event)).not.toContain('my-internal-bot')
})

test('license key → no analysis event, agent or not', async () => {
  process.env.AI_AGENT = 'claude-code_2-1-284_agent'
  await detectAgent()
  expect(createAnalysisEvent({ ...base, licenseKey: 'key' })).toBeNull()
})
