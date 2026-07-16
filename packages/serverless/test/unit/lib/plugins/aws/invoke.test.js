import { jest } from '@jest/globals'

const { default: AwsInvoke } =
  await import('../../../../../lib/plugins/aws/invoke.js')

const createProvider = (overrides = {}) => ({
  getRegion: jest.fn().mockReturnValue('us-east-1'),
  getCredentials: jest.fn().mockResolvedValue({ credentials: {} }),
  naming: { getStackName: jest.fn().mockReturnValue('test-stack') },
  request: jest.fn().mockResolvedValue({}),
  ...overrides,
})

const createServerless = (provider = createProvider()) => ({
  service: { service: 'test-service', provider: { name: 'aws' } },
  getProvider: jest.fn().mockReturnValue(provider),
  serviceDir: '/path/to/service',
  utils: { readFile: jest.fn().mockResolvedValue('{}') },
})

const createMockUtils = () => ({
  log: {
    notice: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    blankLine: jest.fn(),
    debug: jest.fn(),
  },
  progress: { notice: jest.fn(), remove: jest.fn() },
})

function makeInvokePlugin(options = {}) {
  const serverless = createServerless()
  const pluginUtils = createMockUtils()
  return new AwsInvoke(serverless, options, pluginUtils)
}

describe('AwsInvoke', () => {
  describe('invoke:invoke hook', () => {
    test('throws when neither --function nor --agent nor --sandbox is provided', async () => {
      const inst = makeInvokePlugin({})
      await expect(inst.hooks['invoke:invoke']()).rejects.toThrow(
        /--function|--agent|--sandbox/,
      )
    })

    test('core invoke skips (no throw) when only --sandbox is provided', async () => {
      const inst = makeInvokePlugin({ sandbox: 'echo' })
      // Should not throw the "required options" error, and should not attempt
      // a Lambda invoke (that is handled by the invoke-sandbox plugin).
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })

    test('core invoke skips (no throw) when only --agent is provided', async () => {
      const inst = makeInvokePlugin({ agent: 'myAgent' })
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })
  })
})
