import AwsCompileFunctions from '../../../../../../../lib/plugins/aws/package/compile/functions.js'
import Serverless from '../../../../../../../lib/serverless.js'
import AwsProvider from '../../../../../../../lib/plugins/aws/provider.js'
import { jest } from '@jest/globals'

describe('AwsCompileFunctions', () => {
  let serverless
  let awsCompileFunctions

  beforeEach(() => {
    const options = {}
    serverless = new Serverless({ commands: [], options: {} })
    serverless.serviceDir = '.'
    serverless.credentialProviders = {
      aws: {
        getCredentials: jest.fn(),
      },
    }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileFunctions = new AwsCompileFunctions(serverless, options)
  })

  it('should add TenancyConfig to the function resource when tenancy is configured', async () => {
    serverless.service.functions = {
      myFunction: {
        handler: 'index.handler',
        tenancy: {
          mode: 'PER_TENANT',
        },
      },
    }

    await awsCompileFunctions.compileFunctions()

    const functionResource =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
        .MyFunctionLambdaFunction

    expect(functionResource.Properties.TenancyConfig).toEqual({
      TenantIsolationMode: 'PER_TENANT',
    })
  })

  it('should not add TenancyConfig when not configured', async () => {
    serverless.service.functions = {
      myFunction: {
        handler: 'index.handler',
      },
    }

    await awsCompileFunctions.compileFunctions()

    const functionResource =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
        .MyFunctionLambdaFunction

    expect(functionResource.Properties.TenancyConfig).toBeUndefined()
  })
})
