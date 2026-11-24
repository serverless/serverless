/**
 * The package step's validateTemplate runs on the merged template: a function
 * with `Runtime: custom` needs RuntimeConfig, from the compiler (alias ARN or
 * intrinsic in `runtime`), from `resources`, or from a plugin.
 */
import validateTemplate from '../../../../../../../lib/plugins/aws/package/lib/validate-template.js'

const runtimeConfig = {
  RuntimeArn: 'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8',
  RuntimeAlias: 'prod',
}

const contextFor = (resources) => ({
  ...validateTemplate,
  serverless: {
    service: {
      getAllFunctions: () => ['api'],
      provider: { compiledCloudFormationTemplate: { Resources: resources } },
    },
  },
  provider: {
    naming: {
      getLambdaLogicalId: (name) =>
        `${name[0].toUpperCase()}${name.slice(1)}LambdaFunction`,
    },
  },
})

const functionResource = (properties) => ({
  ApiLambdaFunction: { Type: 'AWS::Lambda::Function', Properties: properties },
})

describe('package validateTemplate: customer-managed runtimes', () => {
  it('rejects Runtime custom without RuntimeConfig', () => {
    expect(() =>
      contextFor(functionResource({ Runtime: 'custom' })).validateTemplate(),
    ).toThrow(
      expect.objectContaining({
        code: 'LAMBDA_CUSTOMER_MANAGED_RUNTIME_INVALID_ARN',
        message: expect.stringContaining(
          'Use the runtime alias ARN, for example arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod',
        ),
      }),
    )
  })

  it('accepts Runtime custom with RuntimeConfig from any source', () => {
    expect(() =>
      contextFor(
        functionResource({ Runtime: 'custom', RuntimeConfig: runtimeConfig }),
      ).validateTemplate(),
    ).not.toThrow()
  })

  it('ignores Lambda-managed runtimes, image functions and missing resources', () => {
    for (const resources of [
      functionResource({ Runtime: 'nodejs24.x' }),
      functionResource({ PackageType: 'Image' }),
      {},
    ]) {
      expect(() => contextFor(resources).validateTemplate()).not.toThrow()
    }
  })
})
