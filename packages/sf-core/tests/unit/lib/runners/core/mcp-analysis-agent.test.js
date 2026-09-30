import { createMcpAnalysisEvent } from '../../../../../src/lib/runners/core/mcp.js'
import { detectAgent, resetAgentDetectionForTests } from '@serverless/util'
// Shared with the framework's agent tests: the detector's variables, cleared per case.
import {
  clearAgentEnv,
  hasDevinMarker,
} from '../../../../../../serverless/test/unit/lib/util/agent-env.js'

const testWithoutDevinMarker = hasDevinMarker() ? test.skip : test

const authenticatedData = { userId: 'u', orgId: 'o' }

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
  expect(
    createMcpAnalysisEvent({ toolName: 'deploy', authenticatedData }),
  ).toEqual({
    projectType: 'mcp',
    toolName: 'deploy',
    userId: 'u',
    orgId: 'o',
  })
})

test('known agent → normalised name', async () => {
  process.env.CLAUDECODE = '1'
  await detectAgent()
  expect(
    createMcpAnalysisEvent({ toolName: 'deploy', authenticatedData }).agent,
  ).toBe('claude')
})

test('arbitrary AI_AGENT text → other, raw value never sent', async () => {
  process.env.AI_AGENT = 'my-internal-bot v2'
  await detectAgent()
  const event = createMcpAnalysisEvent({
    toolName: 'deploy',
    authenticatedData,
  })
  expect(event.agent).toBe('other')
  expect(JSON.stringify(event)).not.toContain('my-internal-bot')
})
