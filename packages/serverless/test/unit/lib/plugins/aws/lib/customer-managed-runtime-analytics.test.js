import { buildCustomerManagedRuntimesAnalytics } from '../../../../../../lib/plugins/aws/lib/customer-managed-runtime-analytics.js'

const aliasArn =
  'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

describe('buildCustomerManagedRuntimesAnalytics', () => {
  it('is empty when no function uses a customer-managed runtime', () => {
    expect(
      buildCustomerManagedRuntimesAnalytics({
        provider: { runtime: 'nodejs24.x' },
        functions: { a: { handler: 'a.h' } },
      }),
    ).toEqual({})
  })

  it('counts functions, applying the provider value to functions without a runtime', () => {
    expect(
      buildCustomerManagedRuntimesAnalytics({
        provider: { runtime: { Ref: 'RuntimeStable' } },
        functions: {
          a: { handler: 'a.h' },
          b: { handler: 'b.h', runtime: aliasArn, build: 'esbuild' },
          c: { handler: 'c.h', runtime: 'python3.14' },
          d: { image: 'repo' },
        },
      }),
    ).toEqual({
      customerManagedRuntimes: {
        functions: 2,
        providerLevel: true,
        valueForms: ['aliasArn', 'intrinsic'],
        esbuildFunctions: 1,
      },
    })
  })

  it('reports the runtime management modes in use, never values', () => {
    expect(
      buildCustomerManagedRuntimesAnalytics({
        provider: { runtimeManagement: 'onFunctionUpdate' },
        functions: {
          a: { handler: 'a.h', runtime: aliasArn },
          b: {
            handler: 'b.h',
            runtime: aliasArn,
            runtimeManagement: { mode: 'manual', arn: `${aliasArn}x` },
          },
        },
      }),
    ).toEqual({
      customerManagedRuntimes: {
        functions: 2,
        valueForms: ['aliasArn'],
        runtimeManagementModes: ['manual', 'onFunctionUpdate'],
      },
    })
  })

  it('never throws on malformed input', () => {
    for (const config of [
      undefined,
      null,
      'x',
      { functions: 'x' },
      { functions: { a: null } },
      {
        get functions() {
          throw new Error('boom')
        },
      },
    ]) {
      expect(() => buildCustomerManagedRuntimesAnalytics(config)).not.toThrow()
    }
  })
})
