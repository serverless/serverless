import { rerenderFunctionEnvironments } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/env-rerender.js'
import { resolveIntrinsics } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/local-intrinsic-resolver.js'
import {
  createRegistry,
  registerSqsQueue,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { FAKE_REGION } from '../../../../../../../../lib/plugins/aws/offline/lib/constants.js'

// Build a bound resolver over a real registry + pseudo-params so these tests
// exercise the genuine resolution + drop semantics.
function makeResolver({ registry = createRegistry(), warnings = [] } = {}) {
  const context = {
    registry,
    parameters: {},
    pseudoParams: {
      'AWS::Region': FAKE_REGION,
      'AWS::NoValue': Symbol.for('AWS::NoValue'),
    },
    conditions: new Map(),
    mappings: {},
    warnings,
  }
  return { resolveIntrinsics: (v) => resolveIntrinsics(v, context), warnings }
}

describe('rerenderFunctionEnvironments', () => {
  it('merges provider env into function env with function winning on collision', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {
          environment: { LOG_LEVEL: 'info', SHARED: 'provider-value' },
        },
        functions: {
          fn: { environment: { SHARED: 'function-value', LOCAL: 'x' } },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    const env = serverless.service.functions.fn.environment
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.SHARED).toBe('function-value')
    expect(env.LOCAL).toBe('x')
  })

  it('drops an env key referencing an unknown resource', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {},
        functions: {
          fn: {
            environment: {
              KEEP: 'literal',
              MISSING: { Ref: 'DoesNotExist' },
            },
          },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    const env = serverless.service.functions.fn.environment
    expect(env.KEEP).toBe('literal')
    expect('MISSING' in env).toBe(false)
  })

  it('resolves a pseudo-parameter Ref in a function env', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {},
        functions: { fn: { environment: { REGION: { Ref: 'AWS::Region' } } } },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    expect(serverless.service.functions.fn.environment.REGION).toBe(FAKE_REGION)
  })

  it('resolves intrinsics in a function events[] array', () => {
    const registry = createRegistry()
    registerSqsQueue(registry, {
      logicalId: 'MyQueue',
      name: 'MyQueue',
      arn: 'arn:aws:sqs:us-east-1:000000000000:MyQueue',
      url: 'http://localhost:3002/000000000000/MyQueue',
      properties: {},
    })
    const { resolveIntrinsics: resolve } = makeResolver({ registry })
    const serverless = {
      service: {
        provider: {},
        functions: {
          consumer: {
            events: [{ sqs: { arn: { 'Fn::GetAtt': ['MyQueue', 'Arn'] } } }],
          },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    const arn = serverless.service.functions.consumer.events[0].sqs.arn
    expect(arn).toBe('arn:aws:sqs:us-east-1:000000000000:MyQueue')
  })

  it('resolves intrinsics in a function destinations config', () => {
    const registry = createRegistry()
    registerSqsQueue(registry, {
      logicalId: 'Dlq',
      name: 'Dlq',
      arn: 'arn:aws:sqs:us-east-1:000000000000:Dlq',
      url: 'http://localhost:3002/000000000000/Dlq',
      properties: {},
    })
    const { resolveIntrinsics: resolve } = makeResolver({ registry })
    const serverless = {
      service: {
        provider: {},
        functions: {
          worker: {
            destinations: {
              onFailure: { arn: { 'Fn::GetAtt': ['Dlq', 'Arn'] } },
            },
          },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    const onFailure = serverless.service.functions.worker.destinations.onFailure
    expect(onFailure.arn).toBe('arn:aws:sqs:us-east-1:000000000000:Dlq')
  })

  it('leaves a function without events untouched and does not crash', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {},
        functions: { fn: { handler: 'src/fn.handler' } },
      },
    }

    expect(() =>
      rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve }),
    ).not.toThrow()
    expect(serverless.service.functions.fn.events).toBeUndefined()
  })

  it('resolves provider-level environment in place, dropping an unresolved reference', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {
          environment: {
            REGION: { Ref: 'AWS::Region' },
            IMPORTED: { 'Fn::ImportValue': 'X' },
          },
        },
        functions: {
          fn: { environment: { LOCAL: 'x' } },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    // The provider env object itself is resolved: the resolvable var stays and
    // the unresolved cross-stack import is dropped (it must not survive as a
    // raw CFN object that the invoke path would re-merge into the handler env).
    const providerEnv = serverless.service.provider.environment
    expect(providerEnv.REGION).toBe(FAKE_REGION)
    expect('IMPORTED' in providerEnv).toBe(false)

    // The resolved provider var still flows into the function env.
    const fnEnv = serverless.service.functions.fn.environment
    expect(fnEnv.REGION).toBe(FAKE_REGION)
    expect(fnEnv.LOCAL).toBe('x')
    expect('IMPORTED' in fnEnv).toBe(false)
  })

  it('keeps function-level value winning on collision after resolving provider env', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const serverless = {
      service: {
        provider: {
          environment: { SHARED: { Ref: 'AWS::Region' } },
        },
        functions: {
          fn: { environment: { SHARED: 'function-value' } },
        },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    expect(serverless.service.functions.fn.environment.SHARED).toBe(
      'function-value',
    )
  })

  it('does not mutate process.env', () => {
    const { resolveIntrinsics: resolve } = makeResolver()
    const before = process.env.OFFLINE_RERENDER_PROBE
    const serverless = {
      service: {
        provider: {
          environment: { OFFLINE_RERENDER_PROBE: 'should-not-leak' },
        },
        functions: { fn: { environment: {} } },
      },
    }

    rerenderFunctionEnvironments(serverless, { resolveIntrinsics: resolve })

    expect(process.env.OFFLINE_RERENDER_PROBE).toBe(before)
  })
})
