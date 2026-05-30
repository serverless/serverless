import { seedLambdaIdentities } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/lambda-identities.js'
import { createRegistry } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import {
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from '../../../../../../../../lib/plugins/aws/offline/lib/constants.js'

// A naming stub that mirrors the Framework's getLambdaLogicalId convention:
// upper-cases the first letter of the function key and appends LambdaFunction.
function makeProvider() {
  return {
    naming: {
      getLambdaLogicalId: (key) =>
        `${key.charAt(0).toUpperCase()}${key.slice(1)}LambdaFunction`,
    },
  }
}

describe('seedLambdaIdentities', () => {
  it('registers an identity for each function using deployed name and ARN', () => {
    const registry = createRegistry()
    const serverless = {
      getProvider: () => makeProvider(),
      service: {
        functions: {
          hello: { handler: 'src/hello.handler' },
          worker: { handler: 'src/worker.handler', name: 'custom-worker-name' },
        },
      },
    }

    seedLambdaIdentities(serverless, registry)

    // `hello` has no explicit name → deployed name falls back to the key.
    const hello = registry.lambda.get('HelloLambdaFunction')
    expect(hello).toBeDefined()
    expect(hello.functionKey).toBe('hello')
    expect(hello.name).toBe('hello')
    expect(hello.arn).toBe(
      `arn:aws:lambda:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:function:hello`,
    )

    // `worker` has an explicit name → deployed name uses it.
    const worker = registry.lambda.get('WorkerLambdaFunction')
    expect(worker).toBeDefined()
    expect(worker.functionKey).toBe('worker')
    expect(worker.name).toBe('custom-worker-name')
    expect(worker.arn).toBe(
      `arn:aws:lambda:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:function:custom-worker-name`,
    )
  })

  it('seeds nothing when getProvider is unavailable', () => {
    const registry = createRegistry()
    const serverless = {
      service: { functions: { hello: { handler: 'src/hello.handler' } } },
    }

    expect(() => seedLambdaIdentities(serverless, registry)).not.toThrow()
    expect(registry.lambda.size).toBe(0)
  })

  it('seeds nothing when naming.getLambdaLogicalId is unavailable', () => {
    const registry = createRegistry()
    const serverless = {
      getProvider: () => ({ naming: {} }),
      service: { functions: { hello: { handler: 'src/hello.handler' } } },
    }

    expect(() => seedLambdaIdentities(serverless, registry)).not.toThrow()
    expect(registry.lambda.size).toBe(0)
  })

  it('handles a service with no functions without error', () => {
    const registry = createRegistry()
    const serverless = { getProvider: () => makeProvider(), service: {} }

    expect(() => seedLambdaIdentities(serverless, registry)).not.toThrow()
    expect(registry.lambda.size).toBe(0)
  })
})
