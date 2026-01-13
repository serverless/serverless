import { jest } from '@jest/globals'
import _ from 'lodash'
const { set } = _
import ServerlessAppsyncPlugin from '../../../../../../lib/plugins/aws/appsync/index.js'

/**
 * Creates a minimal mock Serverless object for testing.
 * This avoids the complexity of the real Serverless class which requires
 * credential providers and other initialization.
 */
export const createServerless = () => {
  const serverless = {
    config: {
      servicePath: process.cwd(),
    },
    configurationInput: {
      appSync: appSyncConfig(),
    },
    configSchemaHandler: {
      defineTopLevelProperty: jest.fn(),
    },
    service: {
      service: 'test-service',
      provider: {
        name: 'aws',
        region: 'us-east-1',
        stage: 'dev',
        compiledCloudFormationTemplate: {
          Resources: {},
          Outputs: {},
        },
      },
      resources: {
        Resources: {},
      },
      functions: {},
      custom: {},
    },
    getProvider: () => ({
      naming: {
        getStackName: () => 'test-stack',
        getNormalizedFunctionName: (name) =>
          `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
        getLambdaLogicalId: (name) =>
          `${name.charAt(0).toUpperCase()}${name.slice(1)}LambdaFunction`,
        getLambdaVersionLogicalId: (name, hash) =>
          `${name.charAt(0).toUpperCase()}${name.slice(1)}LambdaVersion${hash}`,
      },
      getRegion: () => 'us-east-1',
      getStage: () => 'dev',
    }),
    setProvider: function () {},
  }

  set(serverless, 'configurationInput.appSync', appSyncConfig())

  return serverless
}

export const plugin = () => {
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  }
  return new ServerlessAppsyncPlugin(createServerless(), options, {
    log: {
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
    },
    progress: {
      create: () => ({
        remove: jest.fn(),
      }),
    },
    writeText: jest.fn(),
  })
}

export const appSyncConfig = (partial) => {
  const config = {
    name: 'MyApi',
    xrayEnabled: false,
    schema: ['schema.graphql'],
    authentication: {
      type: 'API_KEY',
    },
    additionalAuthentications: [],
    resolvers: {},
    pipelineFunctions: {},
    dataSources: {},
    substitutions: {},
    tags: {
      stage: 'Dev',
    },
  }

  return {
    ...config,
    ...partial,
  }
}
