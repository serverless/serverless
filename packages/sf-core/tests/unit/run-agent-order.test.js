// run() must detect the agent and apply the agent session before setupLogging prints the --debug
// settings dump, so that dump reports the final isInteractive value and carries no colour codes.
// Every collaborator is mocked; the test records the order of the calls run() makes.
import { beforeEach, expect, jest, test } from '@jest/globals'

const calls = []
const settings = { logLevel: 'notice', isInteractive: true }
let detected = { isAgent: true, name: 'claude' }
let detectionError = null

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: () => ({
      debug: (message) =>
        calls.push(
          typeof message === 'string'
            ? `debug:${message}`
            : `debug:settings isInteractive=${message.isInteractive}`,
        ),
    }),
  },
  progress: { get: () => ({ create: () => calls.push('progress') }) },
  setGlobalRendererSettings: ({ logLevel }) => {
    settings.logLevel = logLevel
    calls.push(`setLogLevel:${logLevel}`)
  },
  getGlobalRendererSettings: () => ({ ...settings }),
  detectAgent: async () => {
    calls.push('detectAgent')
    return detected
  },
  getAgentDetectionError: () => detectionError,
  applyAgentSession: ({ agent }) => {
    if (agent.isAgent) settings.isInteractive = false
    calls.push('applyAgentSession')
  },
}))
jest.unstable_mockModule('../../src/utils/index.js', () => ({
  getVersions: async () => ({}),
}))
jest.unstable_mockModule('../../src/lib/router.js', () => ({
  route: async () => calls.push('route'),
}))

const { default: sfCore } = await import('../../src/index.js')

beforeEach(() => {
  calls.length = 0
  settings.isInteractive = true
  detected = { isAgent: true, name: 'claude' }
  detectionError = null
})

test('agent session is applied before the --debug settings dump', async () => {
  await sfCore.run({ command: ['print'], options: {}, debug: true })
  expect(calls).toEqual([
    'detectAgent',
    'applyAgentSession',
    'setLogLevel:debug',
    'debug:settings isInteractive=false',
    'debug:AI agent detected: claude',
    'progress',
    'route',
  ])
})

// Detection never throws; a failure (or its timeout) falls back to a person's session and is
// reported only at debug level, after the settings dump.
test('a failed detection is logged at debug level', async () => {
  detected = { isAgent: false, name: undefined }
  detectionError = new Error('timed out after 1000 ms')
  await sfCore.run({ command: ['print'], options: {}, debug: true })
  expect(calls).toEqual([
    'detectAgent',
    'applyAgentSession',
    'setLogLevel:debug',
    'debug:settings isInteractive=true',
    'debug:AI agent detection failed, continuing without it: timed out after 1000 ms',
    'progress',
    'route',
  ])
})
