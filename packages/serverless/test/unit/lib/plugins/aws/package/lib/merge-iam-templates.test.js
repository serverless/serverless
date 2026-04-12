import { jest } from '@jest/globals'
import mergeIamTemplates from '../../../../../../../lib/plugins/aws/package/lib/merge-iam-templates.js'

describe('mergeIamTemplates', () => {
  let context

  beforeEach(() => {
    const functions = {}

    context = {
      serverless: {
        service: {
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
            iam: {
              role: {},
            },
          },
          getAllFunctions: jest.fn(() => Object.keys(functions)),
          getFunction: jest.fn((name) => functions[name]),
        },
        utils: {
          readFileSync: jest.fn(() => ({
            Properties: {
              Policies: [
                {
                  PolicyDocument: {
                    Statement: [],
                  },
                },
              ],
            },
          })),
        },
        config: {
          serverlessPath: 'c:/_Repos/serverless/packages/serverless/lib',
        },
      },
      provider: {
        naming: {
          getLogGroupLogicalId: jest.fn((name) => `${name}LogGroup`),
          getLogGroupName: jest.fn((name) => `/aws/lambda/${name}`),
          getRolePath: jest.fn(() => '/'),
          getRoleName: jest.fn(() => 'test-role'),
        },
        isExistingRoleProvided: jest.fn(() => false),
        getLogRetentionInDays: jest.fn(() => undefined),
        getLogKmsKeyArn: jest.fn(() => undefined),
        getLogDataProtectionPolicy: jest.fn(() => undefined),
      },
    }

    context.functions = functions
  })

  it('applies provider logKmsKeyArn to auto-created Lambda log groups', () => {
    context.provider.getLogKmsKeyArn.mockReturnValue(
      'arn:aws:kms:us-east-1:123456789012:key/provider-key',
    )
    context.functions.hello = {
      name: 'service-dev-hello',
    }

    mergeIamTemplates.mergeIamTemplates.call(context)

    expect(
      context.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.helloLogGroup.Properties,
    ).toMatchObject({
      LogGroupName: '/aws/lambda/service-dev-hello',
      KmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/provider-key',
    })
  })

  it('lets function logKmsKeyArn override the provider setting', () => {
    context.provider.getLogKmsKeyArn.mockReturnValue(
      'arn:aws:kms:us-east-1:123456789012:key/provider-key',
    )
    context.functions.hello = {
      name: 'service-dev-hello',
      logKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/function-key',
    }

    mergeIamTemplates.mergeIamTemplates.call(context)

    expect(
      context.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.helloLogGroup.Properties.KmsKeyId,
    ).toBe('arn:aws:kms:us-east-1:123456789012:key/function-key')
  })
})
