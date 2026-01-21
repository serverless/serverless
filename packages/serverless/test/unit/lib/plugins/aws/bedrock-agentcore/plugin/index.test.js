'use strict'

import { jest } from '@jest/globals'
import * as given from '../given.js'

describe('ServerlessBedrockAgentCore', () => {
  let mockServerless
  let mockOptions
  let mockUtils
  let pluginInstance

  beforeEach(() => {
    jest.clearAllMocks()
    const { plugin, serverless, options, utils } = given.plugin()
    pluginInstance = plugin
    mockServerless = serverless
    mockOptions = options
    mockUtils = utils
  })

  describe('constructor', () => {
    test('initializes plugin with serverless instance', () => {
      expect(pluginInstance.serverless).toBe(mockServerless)
      expect(pluginInstance.options).toBe(mockOptions)
      expect(pluginInstance.log).toBe(mockUtils.log)
      expect(pluginInstance.pluginName).toBe('bedrock-agentcore')
    })

    test('registers lifecycle hooks', () => {
      expect(pluginInstance.hooks).toHaveProperty('initialize')
      expect(pluginInstance.hooks).toHaveProperty('before:package:initialize')
      expect(pluginInstance.hooks).toHaveProperty(
        'before:package:createDeploymentArtifacts',
      )
      expect(pluginInstance.hooks).toHaveProperty('package:compileEvents')
      expect(pluginInstance.hooks).toHaveProperty('after:deploy:deploy')
    })

    test('defines agentcore commands', () => {
      expect(pluginInstance.commands.agentcore).toBeDefined()
      expect(pluginInstance.commands.agentcore.commands.info).toBeDefined()
      expect(pluginInstance.commands.agentcore.commands.build).toBeDefined()
      expect(pluginInstance.commands.agentcore.commands.invoke).toBeDefined()
      expect(pluginInstance.commands.agentcore.commands.logs).toBeDefined()
    })

    test('calls defineAgentsSchema', () => {
      expect(
        mockServerless.configSchemaHandler.defineTopLevelProperty,
      ).toHaveBeenCalledWith('agents', expect.any(Object))
    })
  })

  describe('init', () => {
    test('logs debug message on init', () => {
      pluginInstance.init()

      expect(mockUtils.log.debug).toHaveBeenCalledWith(
        'bedrock-agentcore initialized',
      )
    })
  })

  describe('getContext', () => {
    test('returns correct context', () => {
      const context = pluginInstance.getContext()

      expect(context.serviceName).toBe('test-service')
      expect(context.stage).toBe('dev')
      expect(context.region).toBe('us-east-1')
      expect(context.accountId).toBe('${AWS::AccountId}')
    })

    test('includes custom config when present', () => {
      mockServerless.service.custom = {
        agentCore: {
          defaultTags: { Project: 'test' },
        },
      }
      const { plugin } = given.plugin()
      plugin.serverless.service.custom = mockServerless.service.custom

      const context = plugin.getContext()

      expect(context.customConfig).toEqual({ defaultTags: { Project: 'test' } })
      expect(context.defaultTags).toEqual({ Project: 'test' })
    })
  })

  describe('getAgentsConfig', () => {
    test('returns null when no agents defined', () => {
      delete mockServerless.service.agents
      delete mockServerless.service.initialServerlessConfig
      mockServerless.service.custom = {}
      mockServerless.configurationInput = {}

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toBeNull()
    })

    test('returns agents from service.agents', () => {
      mockServerless.service.agents = { myAgent: { type: 'runtime' } }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ myAgent: { type: 'runtime' } })
    })

    test('returns agents from initialServerlessConfig when service.agents not set', () => {
      delete mockServerless.service.agents
      mockServerless.service.initialServerlessConfig = {
        agents: { myAgent: { type: 'memory' } },
      }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ myAgent: { type: 'memory' } })
    })

    test('returns agents from custom.agents when other sources not set', () => {
      delete mockServerless.service.agents
      delete mockServerless.service.initialServerlessConfig
      mockServerless.service.custom = {
        agents: { myAgent: { type: 'gateway' } },
      }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ myAgent: { type: 'gateway' } })
    })

    test('returns agents from configurationInput when other sources not set', () => {
      delete mockServerless.service.agents
      delete mockServerless.service.initialServerlessConfig
      mockServerless.service.custom = {}
      mockServerless.configurationInput = {
        agents: { myAgent: { type: 'browser' } },
      }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ myAgent: { type: 'browser' } })
    })

    test('prioritizes service.agents over other sources', () => {
      mockServerless.service.agents = { fromService: { type: 'runtime' } }
      mockServerless.service.initialServerlessConfig = {
        agents: { fromInitial: { type: 'memory' } },
      }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ fromService: { type: 'runtime' } })
    })
  })

  describe('validateConfig', () => {
    test('skips validation when no agents defined', () => {
      expect(() => pluginInstance.validateConfig()).not.toThrow()
      expect(mockUtils.log.debug).toHaveBeenCalledWith(
        'No agents defined, skipping AgentCore compilation',
      )
    })

    test('validates all agents when defined', () => {
      mockServerless.service.agents = {
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        },
      }

      expect(() => pluginInstance.validateConfig()).not.toThrow()
      expect(mockUtils.log.info).toHaveBeenCalledWith(
        'Validating 1 agent(s)...',
      )
    })
  })

  describe('validateAgent', () => {
    test('throws error when type is missing', () => {
      expect(() => pluginInstance.validateAgent('myAgent', {})).toThrow(
        "Agent 'myAgent' must have a 'type' property",
      )
    })

    test('throws error for invalid type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'invalid' }),
      ).toThrow("Agent 'myAgent' has invalid type 'invalid'")
    })

    test('accepts valid runtime type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        }),
      ).not.toThrow()
    })

    test('accepts valid memory type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'memory' }),
      ).not.toThrow()
    })

    test('accepts valid gateway type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'gateway' }),
      ).not.toThrow()
    })

    test('accepts valid browser type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'browser' }),
      ).not.toThrow()
    })

    test('accepts valid codeInterpreter type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'codeInterpreter' }),
      ).not.toThrow()
    })

    test('accepts valid workloadIdentity type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'workloadIdentity' }),
      ).not.toThrow()
    })
  })

  describe('validateRuntime', () => {
    test('throws error when neither image nor artifact is specified', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', { type: 'runtime' }),
      ).toThrow("Runtime 'myAgent' must have either 'image'")
    })

    test('accepts artifact.containerImage', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        }),
      ).not.toThrow()
    })

    test('accepts artifact.s3', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { s3: { bucket: 'my-bucket', key: 'agent.zip' } },
        }),
      ).not.toThrow()
    })

    test('accepts artifact.docker', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { docker: { path: '.' } },
        }),
      ).not.toThrow()
    })

    test('accepts image config', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          image: { path: '.', file: 'Dockerfile' },
        }),
      ).not.toThrow()
    })

    test('throws error for invalid artifact config', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: {},
        }),
      ).toThrow("Runtime 'myAgent' artifact must specify either")
    })

    test('validates requestHeaders.allowlist is array', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          requestHeaders: { allowlist: 'not-an-array' },
        }),
      ).toThrow("Runtime 'myAgent' requestHeaders.allowlist must be an array")
    })

    test('validates requestHeaders.allowlist max length', () => {
      const headers = Array.from({ length: 21 }, (_, i) => `Header-${i}`)
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          requestHeaders: { allowlist: headers },
        }),
      ).toThrow('cannot exceed 20 headers')
    })

    test('validates requestHeaders.allowlist header names', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          requestHeaders: { allowlist: ['Valid-Header', ''] },
        }),
      ).toThrow('contains invalid header name')
    })
  })

  describe('validateMemory', () => {
    test('accepts valid memory config', () => {
      expect(() =>
        pluginInstance.validateMemory('myMemory', { type: 'memory' }),
      ).not.toThrow()
    })

    test('throws error for invalid eventExpiryDuration (too low)', () => {
      expect(() =>
        pluginInstance.validateMemory('myMemory', {
          type: 'memory',
          eventExpiryDuration: 5,
        }),
      ).toThrow('must be a number between 7 and 365 days')
    })

    test('throws error for invalid eventExpiryDuration (too high)', () => {
      expect(() =>
        pluginInstance.validateMemory('myMemory', {
          type: 'memory',
          eventExpiryDuration: 400,
        }),
      ).toThrow('must be a number between 7 and 365 days')
    })

    test('accepts valid eventExpiryDuration', () => {
      expect(() =>
        pluginInstance.validateMemory('myMemory', {
          type: 'memory',
          eventExpiryDuration: 30,
        }),
      ).not.toThrow()
    })
  })

  describe('validateGateway', () => {
    test('accepts valid gateway config', () => {
      expect(() =>
        pluginInstance.validateGateway('myGateway', { type: 'gateway' }),
      ).not.toThrow()
    })

    test('throws error for invalid authorizerType', () => {
      expect(() =>
        pluginInstance.validateGateway('myGateway', {
          type: 'gateway',
          authorizerType: 'INVALID',
        }),
      ).toThrow("has invalid authorizerType 'INVALID'")
    })

    test('accepts AWS_IAM authorizerType', () => {
      expect(() =>
        pluginInstance.validateGateway('myGateway', {
          type: 'gateway',
          authorizerType: 'AWS_IAM',
        }),
      ).not.toThrow()
    })

    test('throws error for invalid protocolType', () => {
      expect(() =>
        pluginInstance.validateGateway('myGateway', {
          type: 'gateway',
          protocolType: 'HTTP',
        }),
      ).toThrow("has invalid protocolType 'HTTP'")
    })

    test('accepts MCP protocolType', () => {
      expect(() =>
        pluginInstance.validateGateway('myGateway', {
          type: 'gateway',
          protocolType: 'MCP',
        }),
      ).not.toThrow()
    })
  })

  describe('validateBrowser', () => {
    test('accepts valid browser config', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', { type: 'browser' }),
      ).not.toThrow()
    })

    test('throws error for invalid networkMode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          type: 'browser',
          network: { networkMode: 'PRIVATE' },
        }),
      ).toThrow("has invalid networkMode 'PRIVATE'")
    })

    test('accepts PUBLIC networkMode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          type: 'browser',
          network: { networkMode: 'PUBLIC' },
        }),
      ).not.toThrow()
    })

    test('accepts VPC networkMode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          type: 'browser',
          network: { networkMode: 'VPC' },
        }),
      ).not.toThrow()
    })

    test('throws error for recording without bucket', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          type: 'browser',
          recording: { s3Location: {} },
        }),
      ).toThrow("recording.s3Location must have a 'bucket' property")
    })

    test('accepts valid recording config', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          type: 'browser',
          recording: { s3Location: { bucket: 'my-bucket' } },
        }),
      ).not.toThrow()
    })
  })

  describe('validateCodeInterpreter', () => {
    test('accepts valid codeInterpreter config', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
        }),
      ).not.toThrow()
    })

    test('throws error for invalid networkMode', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
          network: { networkMode: 'INVALID' },
        }),
      ).toThrow("has invalid networkMode 'INVALID'")
    })

    test('accepts SANDBOX networkMode', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
          network: { networkMode: 'SANDBOX' },
        }),
      ).not.toThrow()
    })

    test('throws error for VPC mode without vpcConfig', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
          network: { networkMode: 'VPC' },
        }),
      ).toThrow('requires vpcConfig when networkMode is VPC')
    })

    test('throws error for VPC mode without subnets', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
          network: { networkMode: 'VPC', vpcConfig: {} },
        }),
      ).toThrow('vpcConfig must have at least one subnet')
    })

    test('accepts valid VPC config', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          type: 'codeInterpreter',
          network: {
            networkMode: 'VPC',
            vpcConfig: { subnets: ['subnet-123'] },
          },
        }),
      ).not.toThrow()
    })
  })

  describe('validateWorkloadIdentity', () => {
    test('accepts valid workloadIdentity config', () => {
      expect(() =>
        pluginInstance.validateWorkloadIdentity('myWI', {
          type: 'workloadIdentity',
        }),
      ).not.toThrow()
    })

    test('throws error for name too long', () => {
      const longName = 'a'.repeat(256)
      expect(() =>
        pluginInstance.validateWorkloadIdentity(longName, {
          type: 'workloadIdentity',
        }),
      ).toThrow('name must be between 1 and 255 characters')
    })

    test('throws error for oauth2ReturnUrls not array', () => {
      expect(() =>
        pluginInstance.validateWorkloadIdentity('myWI', {
          type: 'workloadIdentity',
          oauth2ReturnUrls: 'not-an-array',
        }),
      ).toThrow('oauth2ReturnUrls must be an array')
    })

    test('throws error for invalid oauth2ReturnUrl', () => {
      expect(() =>
        pluginInstance.validateWorkloadIdentity('myWI', {
          type: 'workloadIdentity',
          oauth2ReturnUrls: ['http://example.com'],
        }),
      ).toThrow('must contain valid HTTPS URLs')
    })

    test('accepts https oauth2ReturnUrls', () => {
      expect(() =>
        pluginInstance.validateWorkloadIdentity('myWI', {
          type: 'workloadIdentity',
          oauth2ReturnUrls: ['https://example.com/callback'],
        }),
      ).not.toThrow()
    })

    test('accepts localhost oauth2ReturnUrls', () => {
      expect(() =>
        pluginInstance.validateWorkloadIdentity('myWI', {
          type: 'workloadIdentity',
          oauth2ReturnUrls: ['http://localhost:3000/callback'],
        }),
      ).not.toThrow()
    })
  })

  describe('resolveContainerImage', () => {
    test('returns artifact.containerImage when specified', () => {
      const config = { artifact: { containerImage: 'test:latest' } }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('test:latest')
    })

    test('returns built image for artifact.docker', () => {
      pluginInstance.builtImages = { myAgent: 'built:image' }
      const config = { artifact: { docker: { path: '.' } } }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('built:image')
    })

    test('returns built image for string image reference', () => {
      pluginInstance.builtImages = { myImage: 'built:image' }
      const config = { image: 'myImage' }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('built:image')
    })

    test('returns ECR URI from provider.ecr.images', () => {
      mockServerless.service.provider.ecr = {
        images: {
          myImage: { uri: 'ecr:uri' },
        },
      }
      const config = { image: 'myImage' }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('ecr:uri')
    })

    test('returns null when no image found', () => {
      const config = {}
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBeNull()
    })
  })

  describe('compileAgentCoreResources', () => {
    test('returns early when no agents defined', () => {
      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Compiled AgentCore resources'),
      )
    })

    test('returns early when no compiled template', () => {
      mockServerless.service.agents = { myAgent: { type: 'memory' } }
      mockServerless.service.provider.compiledCloudFormationTemplate = null

      pluginInstance.compileAgentCoreResources()

      expect(pluginInstance.resourcesCompiled).toBe(false)
    })

    test('compiles resources only once (idempotent)', () => {
      mockServerless.service.agents = {
        myMemory: { type: 'memory' },
      }

      pluginInstance.compileAgentCoreResources()
      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).toHaveBeenCalledTimes(1)
    })

    test('compiles runtime resources', () => {
      mockServerless.service.agents = {
        myAgent: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyAgentRuntime')
      expect(template.Resources).toHaveProperty('MyAgentRuntimeRole')
      expect(template.Outputs).toHaveProperty('MyAgentRuntimeArn')
    })

    test('compiles memory resources', () => {
      mockServerless.service.agents = {
        myMemory: { type: 'memory' },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyMemoryMemory')
      expect(template.Resources).toHaveProperty('MyMemoryMemoryRole')
    })

    test('compiles gateway resources', () => {
      mockServerless.service.agents = {
        myGateway: { type: 'gateway' },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyGatewayGateway')
      expect(template.Outputs).toHaveProperty('MyGatewayGatewayUrl')
    })

    test('compiles browser resources', () => {
      mockServerless.service.agents = {
        myBrowser: { type: 'browser' },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyBrowserBrowser')
    })

    test('compiles codeInterpreter resources', () => {
      mockServerless.service.agents = {
        myCI: { type: 'codeInterpreter' },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyCICodeInterpreter')
    })

    test('compiles workloadIdentity resources', () => {
      mockServerless.service.agents = {
        myWI: { type: 'workloadIdentity' },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyWIWorkloadIdentity')
    })

    test('compiles runtime with endpoints', () => {
      mockServerless.service.agents = {
        myAgent: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          endpoints: [{ name: 'v1', description: 'Version 1' }],
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyAgentv1Endpoint')
    })

    test('compiles gateway with targets', () => {
      mockServerless.service.agents = {
        myGateway: {
          type: 'gateway',
          targets: [
            { name: 'myLambda', type: 'lambda', functionName: 'myFunc' },
          ],
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyGatewaymyLambdaTarget')
    })

    test('throws error for gateway target without name', () => {
      mockServerless.service.agents = {
        myGateway: {
          type: 'gateway',
          roleArn: 'arn:aws:iam::123456789012:role/ExistingRole',
          targets: [{ description: 'missing name' }],
        },
      }

      expect(() => pluginInstance.compileAgentCoreResources()).toThrow(
        "Gateway 'myGateway' target must have a 'name' property",
      )
    })

    test('uses provided roleArn instead of generating role', () => {
      mockServerless.service.agents = {
        myMemory: {
          type: 'memory',
          roleArn: 'arn:aws:iam::123456789012:role/CustomRole',
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).not.toHaveProperty('MyMemoryMemoryRole')
    })

    test('logs resource summary', () => {
      mockServerless.service.agents = {
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        },
        myMemory: { type: 'memory' },
      }

      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).toHaveBeenCalledWith(
        expect.stringContaining('runtime(s)'),
      )
    })
  })

  describe('displayDeploymentInfo', () => {
    test('returns early when no agents', async () => {
      await pluginInstance.displayDeploymentInfo()

      expect(mockUtils.log.notice).not.toHaveBeenCalled()
    })

    test('displays deployed resources', async () => {
      mockServerless.service.agents = {
        myAgent: { type: 'runtime' },
      }

      await pluginInstance.displayDeploymentInfo()

      expect(mockUtils.log.notice).toHaveBeenCalledWith(
        'AgentCore Resources Deployed:',
      )
      expect(mockUtils.log.notice).toHaveBeenCalledWith('  myAgent (Runtime)')
    })
  })

  describe('showInfo', () => {
    test('shows message when no agents defined', async () => {
      await pluginInstance.showInfo()

      expect(mockUtils.log.notice).toHaveBeenCalledWith(
        'No AgentCore resources defined in this service.',
      )
    })

    test('shows agent information', async () => {
      mockServerless.service.agents = {
        myAgent: { type: 'runtime', description: 'Test agent' },
      }

      await pluginInstance.showInfo()

      expect(mockUtils.log.notice).toHaveBeenCalledWith('AgentCore Resources:')
      expect(mockUtils.log.notice).toHaveBeenCalledWith('  myAgent:')
      expect(mockUtils.log.notice).toHaveBeenCalledWith('    Type: Runtime')
      expect(mockUtils.log.notice).toHaveBeenCalledWith(
        '    Description: Test agent',
      )
    })

    test('shows verbose output when option set', async () => {
      mockServerless.service.agents = {
        myAgent: { type: 'runtime' },
      }
      mockOptions.verbose = true

      await pluginInstance.showInfo()

      expect(mockUtils.log.notice).toHaveBeenCalledWith(
        expect.stringContaining('Config:'),
      )
    })
  })

  describe('getFirstRuntimeAgent', () => {
    test('returns null when no agents', () => {
      const result = pluginInstance.getFirstRuntimeAgent()

      expect(result).toBeNull()
    })

    test('returns first runtime agent name', () => {
      mockServerless.service.agents = {
        myMemory: { type: 'memory' },
        myRuntime: { type: 'runtime' },
        anotherRuntime: { type: 'runtime' },
      }

      const result = pluginInstance.getFirstRuntimeAgent()

      expect(result).toBe('myRuntime')
    })
  })

  describe('parseTimeAgo', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    test('returns default 1 hour for null', () => {
      const result = pluginInstance.parseTimeAgo(null)
      expect(result).toBe(1700000000000 - 60 * 60 * 1000)
    })

    test('parses minutes', () => {
      const result = pluginInstance.parseTimeAgo('30m')
      expect(result).toBe(1700000000000 - 30 * 60 * 1000)
    })

    test('parses hours', () => {
      const result = pluginInstance.parseTimeAgo('2h')
      expect(result).toBe(1700000000000 - 2 * 60 * 60 * 1000)
    })

    test('parses days', () => {
      const result = pluginInstance.parseTimeAgo('1d')
      expect(result).toBe(1700000000000 - 24 * 60 * 60 * 1000)
    })

    test('parses date string', () => {
      const result = pluginInstance.parseTimeAgo('2024-01-01')
      expect(result).toBe(new Date('2024-01-01').getTime())
    })

    test('returns default for invalid string', () => {
      const result = pluginInstance.parseTimeAgo('invalid')
      expect(result).toBe(1700000000000 - 60 * 60 * 1000)
    })
  })

  describe('invokeAgent', () => {
    beforeEach(() => {
      mockOptions.message = 'test message'
    })

    test('throws error when no runtime agents found', async () => {
      await expect(pluginInstance.invokeAgent()).rejects.toThrow(
        'No runtime agents found in configuration',
      )
    })

    test('throws error when message not provided', async () => {
      mockServerless.service.agents = {
        myAgent: { type: 'runtime' },
      }
      mockOptions.message = undefined

      await expect(pluginInstance.invokeAgent()).rejects.toThrow(
        'Message is required',
      )
    })
  })

  describe('fetchLogs', () => {
    test('throws error when no runtime agents found', async () => {
      await expect(pluginInstance.fetchLogs()).rejects.toThrow(
        'No runtime agents found in configuration',
      )
    })
  })
})
