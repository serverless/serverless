'use strict'

import { jest } from '@jest/globals'
import ServerlessBedrockAgentCore from '../../../../../../lib/plugins/aws/bedrock-agentcore/index.js'

/**
 * Creates a minimal mock Serverless object for testing.
 * Uses ai top-level property (agents, memory, tools, etc. as nested properties).
 */
export const createServerless = (ai = {}) => ({
  service: {
    service: 'test-service',
    ai,
    provider: {
      compiledCloudFormationTemplate: {
        Resources: {},
        Outputs: {},
      },
      stage: 'dev',
      region: 'us-east-1',
    },
    custom: {},
    initialServerlessConfig: {},
  },
  getProvider: jest.fn().mockReturnValue({
    getStage: jest.fn().mockReturnValue('dev'),
    getRegion: jest.fn().mockReturnValue('us-east-1'),
    getAccountId: jest.fn().mockResolvedValue('123456789012'),
    naming: {
      getStackName: jest.fn().mockReturnValue('test-service-dev'),
    },
    request: jest.fn(),
  }),
  configSchemaHandler: {
    defineTopLevelProperty: jest.fn(),
    defineCustomProperties: jest.fn(),
  },
  classes: {
    Error: class ServerlessError extends Error {
      constructor(message) {
        super(message)
        this.name = 'ServerlessError'
      }
    },
  },
  configurationInput: {},
  serviceDir: '/path/to/service',
})

export const createMockUtils = () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    notice: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
  progress: {},
  writeText: jest.fn(),
})

export const plugin = (ai = {}) => {
  const serverless = createServerless(ai)
  const options = {}
  const utils = createMockUtils()
  return {
    plugin: new ServerlessBedrockAgentCore(serverless, options, utils),
    serverless,
    options,
    utils,
  }
}
