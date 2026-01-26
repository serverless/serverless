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
        agents: { myAgent: { type: 'gateway' } },
      }

      const agents = pluginInstance.getAgentsConfig()

      expect(agents).toEqual({ myAgent: { type: 'gateway' } })
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
        agents: { fromInitial: { type: 'gateway' } },
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
    test('defaults to runtime type when not specified', () => {
      const config = { artifact: { containerImage: 'test:latest' } }
      pluginInstance.validateAgent('myAgent', config)
      expect(config.type).toBe('runtime')
    })

    test('throws error for invalid type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'invalid' }),
      ).toThrow("Agent 'myAgent' has invalid type 'invalid'")
    })

    test('throws error for memory type (no longer valid as agent type)', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', { type: 'memory' }),
      ).toThrow("Agent 'myAgent' has invalid type 'memory'")
    })

    test('accepts valid runtime type', () => {
      expect(() =>
        pluginInstance.validateAgent('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        }),
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
    test('accepts runtime with no artifact (buildpacks auto-detection)', () => {
      // When no artifact config is specified, buildpacks auto-detection will be used
      expect(() =>
        pluginInstance.validateRuntime('myAgent', { type: 'runtime' }),
      ).not.toThrow()
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

  describe('validateMemoryConfig', () => {
    test('accepts valid memory config', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {}),
      ).not.toThrow()
    })

    test('throws error for invalid expiration (too low)', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          expiration: 5,
        }),
      ).toThrow('must be a number between 7 and 365 days')
    })

    test('throws error for invalid expiration (too high)', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          expiration: 400,
        }),
      ).toThrow('must be a number between 7 and 365 days')
    })

    test('accepts valid expiration', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          expiration: 30,
        }),
      ).not.toThrow()
    })

    test('throws error for non-string encryptionKey', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          encryptionKey: 123,
        }),
      ).toThrow('encryptionKey must be a string')
    })

    test('throws error for non-array strategies', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          strategies: 'not-an-array',
        }),
      ).toThrow('strategies must be an array')
    })
  })

  describe('validateRuntime with memory', () => {
    test('accepts runtime with inline memory config', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: { expiration: 90 },
        }),
      ).not.toThrow()
    })

    test('accepts runtime with shared memory reference', () => {
      const sharedMemories = { 'shared-memory': { expiration: 90 } }
      expect(() =>
        pluginInstance.validateRuntime(
          'myAgent',
          {
            type: 'runtime',
            artifact: { containerImage: 'test:latest' },
            memory: 'shared-memory',
          },
          sharedMemories,
        ),
      ).not.toThrow()
    })

    test('throws error for invalid memory reference', () => {
      expect(() =>
        pluginInstance.validateRuntime(
          'myAgent',
          {
            type: 'runtime',
            artifact: { containerImage: 'test:latest' },
            memory: 'non-existent-memory',
          },
          {},
        ),
      ).toThrow("references memory 'non-existent-memory' which is not defined")
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
      mockServerless.service.agents = { myAgent: { type: 'gateway' } }
      mockServerless.service.provider.compiledCloudFormationTemplate = null

      pluginInstance.compileAgentCoreResources()

      expect(pluginInstance.resourcesCompiled).toBe(false)
    })

    test('compiles resources only once (idempotent)', () => {
      mockServerless.service.agents = {
        memory: { myMemory: { expiration: 90 } },
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

    test('compiles shared memory resources', () => {
      mockServerless.service.agents = {
        memory: {
          myMemory: { expiration: 90 },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyMemoryMemory')
      expect(template.Resources).toHaveProperty('MyMemoryMemoryRole')
    })

    test('compiles inline memory for runtime', () => {
      mockServerless.service.agents = {
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: { expiration: 90 },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyRuntimeRuntime')
      // Note: The naming utility converts hyphens to "Dash" in logical IDs
      expect(template.Resources).toHaveProperty('MyRuntimeDashmemoryMemory')
      expect(template.Resources).toHaveProperty('MyRuntimeDashmemoryMemoryRole')
    })

    test('compiles runtime with shared memory reference', () => {
      mockServerless.service.agents = {
        memory: {
          sharedMem: { expiration: 90 },
        },
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: 'sharedMem',
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('SharedMemMemory')
      expect(template.Resources).toHaveProperty('MyRuntimeRuntime')
      // Runtime should depend on the shared memory
      expect(template.Resources.MyRuntimeRuntime.DependsOn).toContain(
        'SharedMemMemory',
      )
      // Memory ARN output should be added
      expect(template.Outputs).toHaveProperty('MyRuntimeRuntimeMemoryArn')
    })

    test('injects BEDROCK_AGENTCORE_MEMORY_ID env var for inline memory', () => {
      mockServerless.service.agents = {
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: { expiration: 90 },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyRuntimeRuntime
      expect(runtime.Properties.EnvironmentVariables).toBeDefined()
      expect(
        runtime.Properties.EnvironmentVariables.BEDROCK_AGENTCORE_MEMORY_ID,
      ).toEqual({
        'Fn::GetAtt': ['MyRuntimeDashmemoryMemory', 'MemoryId'],
      })
    })

    test('injects BEDROCK_AGENTCORE_MEMORY_ID env var for shared memory reference', () => {
      mockServerless.service.agents = {
        memory: {
          sharedMem: { expiration: 90 },
        },
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: 'sharedMem',
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyRuntimeRuntime
      expect(runtime.Properties.EnvironmentVariables).toBeDefined()
      expect(
        runtime.Properties.EnvironmentVariables.BEDROCK_AGENTCORE_MEMORY_ID,
      ).toEqual({
        'Fn::GetAtt': ['SharedMemMemory', 'MemoryId'],
      })
    })

    test('preserves existing env vars when adding BEDROCK_AGENTCORE_MEMORY_ID', () => {
      mockServerless.service.agents = {
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
          memory: { expiration: 90 },
          environment: {
            MY_VAR: 'my-value',
            ANOTHER_VAR: 'another-value',
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyRuntimeRuntime
      expect(runtime.Properties.EnvironmentVariables.MY_VAR).toBe('my-value')
      expect(runtime.Properties.EnvironmentVariables.ANOTHER_VAR).toBe(
        'another-value',
      )
      expect(
        runtime.Properties.EnvironmentVariables.BEDROCK_AGENTCORE_MEMORY_ID,
      ).toEqual({
        'Fn::GetAtt': ['MyRuntimeDashmemoryMemory', 'MemoryId'],
      })
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

    test('uses provided roleArn instead of generating role', () => {
      mockServerless.service.agents = {
        memory: {
          myMemory: {
            expiration: 90,
            roleArn: 'arn:aws:iam::123456789012:role/CustomRole',
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).not.toHaveProperty('MyMemoryMemoryRole')
    })

    test('logs resource summary', () => {
      mockServerless.service.agents = {
        memory: { myMemory: { expiration: 90 } },
        myRuntime: {
          type: 'runtime',
          artifact: { containerImage: 'test:latest' },
        },
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

    test('completes without logging when resources exist', async () => {
      mockServerless.service.agents = {
        myAgent: { type: 'runtime' },
      }

      await pluginInstance.displayDeploymentInfo()

      // No logging output - resources deployed silently
      expect(mockUtils.log.notice).not.toHaveBeenCalled()
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
        myBrowser: { type: 'browser' },
        myRuntime: { type: 'runtime' },
        anotherRuntime: { type: 'runtime' },
      }

      const result = pluginInstance.getFirstRuntimeAgent()

      expect(result).toBe('myRuntime')
    })

    test('skips memory reserved key', () => {
      mockServerless.service.agents = {
        memory: { sharedMem: { expiration: 90 } },
        myRuntime: { type: 'runtime' },
      }

      const result = pluginInstance.getFirstRuntimeAgent()

      expect(result).toBe('myRuntime')
    })

    test('skips tools reserved key', () => {
      mockServerless.service.agents = {
        tools: { myTool: { mcp: 'https://example.com/mcp' } },
        myRuntime: { type: 'runtime' },
      }

      const result = pluginInstance.getFirstRuntimeAgent()

      expect(result).toBe('myRuntime')
    })
  })

  describe('tools functionality', () => {
    describe('collectAllTools', () => {
      test('returns hasTools false when no tools defined', () => {
        mockServerless.service.agents = {
          myRuntime: { type: 'runtime' },
        }

        const result = pluginInstance.collectAllTools(
          mockServerless.service.agents,
        )

        expect(result.hasTools).toBe(false)
        expect(result.sharedTools).toEqual({})
        expect(result.agentTools).toEqual({})
      })

      test('returns hasTools true when shared tools defined', () => {
        mockServerless.service.agents = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
          myRuntime: { type: 'runtime' },
        }

        const result = pluginInstance.collectAllTools(
          mockServerless.service.agents,
        )

        expect(result.hasTools).toBe(true)
        expect(result.sharedTools).toEqual({
          myTool: { mcp: 'https://example.com/mcp' },
        })
      })

      test('returns hasTools true when agent has tools', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            tools: { myTool: { mcp: 'https://example.com/mcp' } },
          },
        }

        const result = pluginInstance.collectAllTools(
          mockServerless.service.agents,
        )

        expect(result.hasTools).toBe(true)
        expect(result.agentTools.myRuntime).toBeDefined()
      })

      test('resolves string references to shared tools', () => {
        mockServerless.service.agents = {
          tools: { sharedMcp: { mcp: 'https://example.com/mcp' } },
          myRuntime: {
            type: 'runtime',
            tools: { myTool: 'sharedMcp' },
          },
        }

        const result = pluginInstance.collectAllTools(
          mockServerless.service.agents,
        )

        expect(result.agentTools.myRuntime.myTool).toEqual({
          mcp: 'https://example.com/mcp',
        })
      })
    })

    describe('validateToolConfig', () => {
      test('throws error when function tool missing toolSchema', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', { function: 'hello' }),
        ).toThrow("Tool 'myTool' with function type requires toolSchema")
      })

      test('does not throw for function tool with toolSchema', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            function: 'hello',
            toolSchema: [
              {
                name: 'test',
                description: 'test',
                inputSchema: { type: 'string' },
              },
            ],
          }),
        ).not.toThrow()
      })

      test('throws error for invalid MCP URL', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            mcp: 'http://insecure.example.com',
          }),
        ).toThrow("Tool 'myTool' mcp endpoint must be a valid https:// URL")
      })

      test('throws error for OAUTH credentials missing providerArn', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            mcp: 'https://example.com/mcp',
            credentials: { type: 'OAUTH', scopes: ['read'] },
          }),
        ).toThrow(
          "Tool 'myTool' OAUTH credentials require providerArn and scopes",
        )
      })

      test('throws error for API_KEY credentials missing providerArn', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            mcp: 'https://example.com/mcp',
            credentials: { type: 'API_KEY' },
          }),
        ).toThrow("Tool 'myTool' API_KEY credentials require providerArn")
      })
    })

    describe('validateConfig with tools', () => {
      test('throws error when shared tool is a string reference', () => {
        mockServerless.service.agents = {
          tools: { myTool: 'some-ref' },
        }

        expect(() => pluginInstance.validateConfig()).toThrow(
          "Shared tool 'myTool' cannot be a reference - define it inline",
        )
      })

      test('throws error when agent tool references non-existent shared tool', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            tools: { myTool: 'nonExistentTool' },
          },
        }

        expect(() => pluginInstance.validateConfig()).toThrow(
          "Runtime 'myRuntime' tool 'myTool' references shared tool 'nonExistentTool' which is not defined in agents.tools",
        )
      })

      test('validates successfully with valid tool references', () => {
        mockServerless.service.agents = {
          tools: { sharedMcp: { mcp: 'https://example.com/mcp' } },
          myRuntime: {
            type: 'runtime',
            tools: { myTool: 'sharedMcp' },
          },
        }

        expect(() => pluginInstance.validateConfig()).not.toThrow()
      })
    })

    describe('compileAgentCoreResources with tools', () => {
      test('creates gateway when shared tools exist', () => {
        mockServerless.service.agents = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Resources.AgentCoreGateway).toBeDefined()
        expect(template.Resources.AgentCoreGateway.Type).toBe(
          'AWS::BedrockAgentCore::Gateway',
        )
      })

      test('creates gateway when agent has tools', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            artifact: { containerImage: 'test:latest' },
            tools: { myTool: { mcp: 'https://example.com/mcp' } },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Resources.AgentCoreGateway).toBeDefined()
      })

      test('does not create gateway when no tools', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            artifact: { containerImage: 'test:latest' },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Resources.AgentCoreGateway).toBeUndefined()
      })

      test('adds gateway outputs', () => {
        mockServerless.service.agents = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Outputs.AgentCoreGatewayArn).toBeDefined()
        expect(template.Outputs.AgentCoreGatewayId).toBeDefined()
        expect(template.Outputs.AgentCoreGatewayUrl).toBeDefined()
      })

      test('compiles shared tools as GatewayTarget resources', () => {
        mockServerless.service.agents = {
          tools: {
            'my-mcp': { mcp: 'https://example.com/mcp' },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        // Tool logical ID is getLogicalId(toolName, 'Tool'):
        // 'my-mcp' -> 'myDashmcp' -> 'MyDashmcp' -> 'MyDashmcpTool'
        expect(template.Resources.MyDashmcpTool).toBeDefined()
        expect(template.Resources.MyDashmcpTool.Type).toBe(
          'AWS::BedrockAgentCore::GatewayTarget',
        )
      })
    })

    describe('env var injection', () => {
      test('injects BEDROCK_AGENTCORE_GATEWAY_URL when agent has tools', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            artifact: { containerImage: 'test-image:latest' },
            tools: { myTool: { mcp: 'https://example.com/mcp' } },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate
        const runtime = template.Resources.MyRuntimeRuntime

        // EnvironmentVariables is a top-level property in Properties
        expect(runtime.Properties.EnvironmentVariables).toHaveProperty(
          'BEDROCK_AGENTCORE_GATEWAY_URL',
        )
        expect(
          runtime.Properties.EnvironmentVariables.BEDROCK_AGENTCORE_GATEWAY_URL,
        ).toEqual({ 'Fn::GetAtt': ['AgentCoreGateway', 'GatewayUrl'] })
      })

      test('does not inject gateway URL when agent has no tools', () => {
        mockServerless.service.agents = {
          myRuntime: {
            type: 'runtime',
            artifact: { containerImage: 'test-image:latest' },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate
        const runtime = template.Resources.MyRuntimeRuntime

        const envVars = runtime.Properties.EnvironmentVariables || {}
        expect(envVars.BEDROCK_AGENTCORE_GATEWAY_URL).toBeUndefined()
      })
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

  describe('fetchLogs', () => {
    test('throws error when no runtime agents found', async () => {
      await expect(pluginInstance.fetchLogs()).rejects.toThrow(
        'No runtime agents found in configuration',
      )
    })
  })
})
