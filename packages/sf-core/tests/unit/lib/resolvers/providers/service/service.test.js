import { jest } from '@jest/globals'
import { Service } from '../../../../../../src/lib/resolvers/providers/service/service.js'

/**
 * Build a Service provider instance with an injected compose context.
 * The compose dispatch pass injects `composeContext` on the instance at
 * dispatch time (`setComposeContext`); here we pre-populate it to exercise the
 * transport-only provider in isolation. The provider config carries only what
 * the user declares (`type`, and `stage` for a pinned instance) — never the
 * context, which would otherwise land in the user's compose configuration.
 */
const buildProvider = ({ stage, composeContext } = {}) => {
  const providerConfig = { type: 'service' }
  if (stage !== undefined) {
    providerConfig.stage = stage
  }
  const provider = new Service({ providerConfig })
  if (composeContext !== undefined) {
    provider.setComposeContext(composeContext)
  }
  return provider
}

const buildComposeContext = (overrides = {}) => ({
  runStage: 'alice',
  aliases: ['orders-db', 'api'],
  getOutputs: jest.fn(async () => ({ QueueUrl: 'https://sqs/orders' })),
  command: ['deploy'],
  ...overrides,
})

describe('Service provider', () => {
  describe('static shape', () => {
    it('declares the expected static provider metadata', () => {
      expect(Service.type).toBe('service')
      expect(Service.composeOnly).toBe(true)
      expect(Service.resolvers).toEqual(['service'])
      expect(Service.defaultResolver).toBe('service')
    })
  })

  describe('resolveVariable', () => {
    it('names serverless-compose.yml and services.<service>.params when used without a compose context', async () => {
      const provider = buildProvider({ composeContext: undefined })
      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db.QueueUrl',
        }),
      ).rejects.toThrow(
        /supported only in serverless-compose\.yml, under 'services\.<service>\.params'.*\$\{param:\.\.\.\}/,
      )
    })

    it('resolves an output for a same-stage reference', async () => {
      const composeContext = buildComposeContext()
      const provider = buildProvider({ composeContext })

      const result = await provider.resolveVariable({
        resolverType: 'service',
        key: 'orders-db.QueueUrl',
      })

      expect(result).toBe('https://sqs/orders')
      expect(composeContext.getOutputs).toHaveBeenCalledWith(
        'orders-db',
        'alice',
      )
    })

    it('resolves an empty-string output value (not treated as missing)', async () => {
      const composeContext = buildComposeContext({
        getOutputs: jest.fn(async () => ({ QueueUrl: '' })),
      })
      const provider = buildProvider({ composeContext })

      const result = await provider.resolveVariable({
        resolverType: 'service',
        key: 'orders-db.QueueUrl',
      })

      expect(result).toBe('')
    })

    it('uses the pinned stage over the run stage for a named instance', async () => {
      const composeContext = buildComposeContext()
      const provider = buildProvider({ stage: 'dev', composeContext })

      await provider.resolveVariable({
        resolverType: 'service',
        key: 'orders-db.QueueUrl',
      })

      expect(composeContext.getOutputs).toHaveBeenCalledWith('orders-db', 'dev')
    })

    it('throws a teaching error for a malformed key', async () => {
      const provider = buildProvider({ composeContext: buildComposeContext() })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db',
        }),
      ).rejects.toThrow(/alias\.OutputKey/)
    })

    it('throws listing valid aliases for an unknown alias', async () => {
      const composeContext = buildComposeContext()
      const provider = buildProvider({ composeContext })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'unknown.QueueUrl',
        }),
      ).rejects.toThrow(/orders-db, api/)
      expect(composeContext.getOutputs).not.toHaveBeenCalled()
    })

    it('throws a deploy hint naming the effective stage when no state exists', async () => {
      const composeContext = buildComposeContext({
        getOutputs: jest.fn(async () => undefined),
      })
      const provider = buildProvider({ stage: 'dev', composeContext })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db.QueueUrl',
        }),
      ).rejects.toThrow(
        "no deployed state found for service 'orders-db'. Deploy it first with 'serverless deploy --service=orders-db --stage dev'",
      )
    })

    it('throws the deploy hint (not a TypeError) when outputs is null', async () => {
      const composeContext = buildComposeContext({
        getOutputs: jest.fn(async () => null),
      })
      const provider = buildProvider({ stage: 'dev', composeContext })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db.QueueUrl',
        }),
      ).rejects.toThrow(
        "no deployed state found for service 'orders-db'. Deploy it first with 'serverless deploy --service=orders-db --stage dev'",
      )
    })

    it('throws listing available outputs when the output key is missing', async () => {
      const composeContext = buildComposeContext({
        getOutputs: jest.fn(async () => ({
          QueueUrl: 'https://sqs/orders',
          QueueArn: 'arn:aws:sqs',
        })),
      })
      const provider = buildProvider({ composeContext })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db.Nope',
        }),
      ).rejects.toThrow(
        "service 'orders-db' has no output 'Nope'. Available outputs: QueueUrl, QueueArn",
      )
    })

    it('rejects an unsupported resolver type', async () => {
      const provider = buildProvider({ composeContext: buildComposeContext() })

      await expect(
        provider.resolveVariable({
          resolverType: 'nope',
          key: 'orders-db.QueueUrl',
        }),
      ).rejects.toThrow(/not supported/)
    })

    it('throws a clear error when the compose context was not injected', async () => {
      const provider = buildProvider({ composeContext: undefined })

      await expect(
        provider.resolveVariable({
          resolverType: 'service',
          key: 'orders-db.QueueUrl',
        }),
      ).rejects.toThrow(
        /serverless-compose\.yml, under 'services\.<service>\.params'/,
      )
    })
  })

  describe('validateConfig', () => {
    it('accepts a bare service config', () => {
      expect(() => Service.validateConfig({ type: 'service' })).not.toThrow()
    })

    it('accepts a service config with a string stage', () => {
      expect(() =>
        Service.validateConfig({ type: 'service', stage: 'dev' }),
      ).not.toThrow()
    })

    it('rejects an unknown field', () => {
      expect(() =>
        Service.validateConfig({ type: 'service', region: 'x' }),
      ).toThrow()
    })

    it('rejects a non-string stage', () => {
      expect(() =>
        Service.validateConfig({ type: 'service', stage: 5 }),
      ).toThrow()
    })
  })
})
