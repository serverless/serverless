'use strict'

import { jest } from '@jest/globals'
import * as given from '../given.js'
import {
  collectAllTools,
  collectGateways,
  normalizeAuthorizer,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilation/orchestrator.js'

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

    test('calls defineAgentsSchema', () => {
      expect(
        mockServerless.configSchemaHandler.defineTopLevelProperty,
      ).toHaveBeenCalledWith('ai', expect.any(Object))
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
  })

  describe('getAiConfig', () => {
    test('returns null when no ai config defined', () => {
      delete mockServerless.service.ai
      delete mockServerless.service.initialServerlessConfig
      mockServerless.configurationInput = {}

      const aiConfig = pluginInstance.getAiConfig()

      expect(aiConfig).toBeNull()
    })

    test('returns ai config from service.ai', () => {
      mockServerless.service.ai = {
        agents: { myAgent: { artifact: { image: 'test' } } },
      }

      const aiConfig = pluginInstance.getAiConfig()

      expect(aiConfig).toEqual({
        agents: { myAgent: { artifact: { image: 'test' } } },
      })
    })

    test('returns ai config from initialServerlessConfig when service.ai not set', () => {
      delete mockServerless.service.ai
      mockServerless.service.initialServerlessConfig = {
        ai: { agents: { myAgent: { artifact: { image: 'test' } } } },
      }

      const aiConfig = pluginInstance.getAiConfig()

      expect(aiConfig).toEqual({
        agents: { myAgent: { artifact: { image: 'test' } } },
      })
    })

    test('returns ai config from configurationInput when other sources not set', () => {
      delete mockServerless.service.ai
      delete mockServerless.service.initialServerlessConfig
      mockServerless.configurationInput = {
        ai: { agents: { myAgent: { artifact: { image: 'test' } } } },
      }

      const aiConfig = pluginInstance.getAiConfig()

      expect(aiConfig).toEqual({
        agents: { myAgent: { artifact: { image: 'test' } } },
      })
    })

    test('prioritizes service.ai over other sources', () => {
      mockServerless.service.ai = {
        agents: { fromService: { artifact: { image: 'test1' } } },
      }
      mockServerless.service.initialServerlessConfig = {
        ai: { agents: { fromInitial: { artifact: { image: 'test2' } } } },
      }

      const aiConfig = pluginInstance.getAiConfig()

      expect(aiConfig).toEqual({
        agents: { fromService: { artifact: { image: 'test1' } } },
      })
    })
  })

  describe('validateConfig', () => {
    test('skips validation when no ai config defined', () => {
      expect(() => pluginInstance.validateConfig()).not.toThrow()
      expect(mockUtils.log.debug).toHaveBeenCalledWith(
        'No ai config defined, skipping AgentCore compilation',
      )
    })

    test('validates all agents when defined', () => {
      mockServerless.service.ai = {
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
          },
        },
      }

      expect(() => pluginInstance.validateConfig()).not.toThrow()
      expect(mockUtils.log.info).toHaveBeenCalledWith(
        'Validating 1 agent(s)...',
      )
    })
  })

  describe('validateAgent', () => {
    test('non-reserved keys are treated as runtime agents', () => {
      const config = { artifact: { image: 'test:latest' } }
      // No type property needed - all non-reserved keys are runtimes
      expect(() =>
        pluginInstance.validateAgent('myAgent', config),
      ).not.toThrow()
    })
  })

  describe('validateRuntime', () => {
    test('accepts runtime with no artifact (buildpacks auto-detection)', () => {
      expect(() => pluginInstance.validateRuntime('myAgent', {})).not.toThrow()
    })

    test('accepts artifact.image', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: { image: 'test:latest' },
        }),
      ).not.toThrow()
    })

    test('accepts artifact.s3 with handler', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          handler: 'agent.py',
          artifact: { s3: { bucket: 'my-bucket', key: 'agent.zip' } },
        }),
      ).not.toThrow()
    })

    test('accepts artifact.docker', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: { docker: { path: '.' } },
        }),
      ).not.toThrow()
    })

    test('accepts image config', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          image: { path: '.', file: 'Dockerfile' },
        }),
      ).not.toThrow()
    })

    test('accepts empty artifact (defaults to code deployment)', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: {},
        }),
      ).not.toThrow()
    })

    test('validates requestHeaders.allowlist is array', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: { image: 'test:latest' },
          requestHeaders: { allowlist: 'not-an-array' },
        }),
      ).toThrow("Runtime 'myAgent' requestHeaders.allowlist must be an array")
    })

    test('validates requestHeaders.allowlist max length', () => {
      const headers = Array.from({ length: 21 }, (_, i) => `Header-${i}`)
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: { image: 'test:latest' },
          requestHeaders: { allowlist: headers },
        }),
      ).toThrow('cannot exceed 20 headers')
    })

    test('validates requestHeaders.allowlist header names', () => {
      expect(() =>
        pluginInstance.validateRuntime('myAgent', {
          artifact: { image: 'test:latest' },
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
          expiration: 2,
        }),
      ).toThrow('must be a number between 3 and 365 days')
    })

    test('throws error for invalid expiration (too high)', () => {
      expect(() =>
        pluginInstance.validateMemoryConfig('myMemory', {
          expiration: 400,
        }),
      ).toThrow('must be a number between 3 and 365 days')
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
          artifact: { image: 'test:latest' },
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
            artifact: { image: 'test:latest' },
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
            artifact: { image: 'test:latest' },
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
        pluginInstance.validateBrowser('myBrowser', {}),
      ).not.toThrow()
    })

    test('throws error for invalid mode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          network: { mode: 'PRIVATE' },
        }),
      ).toThrow("has invalid network.mode 'PRIVATE'")
    })

    test('accepts PUBLIC mode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          network: { mode: 'PUBLIC' },
        }),
      ).not.toThrow()
    })

    test('accepts VPC mode', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          network: { mode: 'VPC' },
        }),
      ).not.toThrow()
    })

    test('throws error for recording without bucket', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          recording: { s3Location: {} },
        }),
      ).toThrow("recording.s3Location must have a 'bucket' property")
    })

    test('accepts valid recording config', () => {
      expect(() =>
        pluginInstance.validateBrowser('myBrowser', {
          recording: { s3Location: { bucket: 'my-bucket' } },
        }),
      ).not.toThrow()
    })
  })

  describe('validateCodeInterpreter', () => {
    test('accepts valid codeInterpreter config', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {}),
      ).not.toThrow()
    })

    test('throws error for invalid mode', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          network: { mode: 'INVALID' },
        }),
      ).toThrow("has invalid network.mode 'INVALID'")
    })

    test('accepts SANDBOX mode', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          network: { mode: 'SANDBOX' },
        }),
      ).not.toThrow()
    })

    test('throws error for VPC mode without subnets', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          network: { mode: 'VPC' },
        }),
      ).toThrow('requires network.subnets when mode is VPC')
    })

    test('accepts valid VPC config with flat structure', () => {
      expect(() =>
        pluginInstance.validateCodeInterpreter('myCI', {
          network: {
            mode: 'VPC',
            subnets: ['subnet-123'],
          },
        }),
      ).not.toThrow()
    })
  })

  describe('resolveContainerImage', () => {
    test('returns artifact.image when specified', () => {
      const config = { artifact: { image: 'test:latest' } }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('test:latest')
    })

    test('returns built image for artifact.docker', () => {
      pluginInstance.builtImages = { myAgent: 'built:image' }
      const config = { artifact: { docker: { path: '.' } } }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('built:image')
    })

    test('returns built image for artifact.image build config', () => {
      pluginInstance.builtImages = { myAgent: 'built:image' }
      const config = { artifact: { image: { path: '.', file: 'Dockerfile' } } }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBe('built:image')
    })

    test('returns null for unknown image reference', () => {
      mockServerless.service.provider.ecr = {
        images: {
          otherImage: { uri: 'ecr:uri' },
        },
      }
      const config = { artifact: {} }
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBeNull()
    })

    test('returns null when no image found', () => {
      const config = {}
      const result = pluginInstance.resolveContainerImage('myAgent', config)
      expect(result).toBeNull()
    })
  })

  describe('compileAgentCoreResources', () => {
    test('returns early when no ai config defined', () => {
      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Compiled AgentCore resources'),
      )
    })

    test('returns early when no compiled template', () => {
      mockServerless.service.ai = {
        agents: { myAgent: { artifact: { image: 'test' } } },
      }
      mockServerless.service.provider.compiledCloudFormationTemplate = null

      pluginInstance.compileAgentCoreResources()

      expect(pluginInstance.resourcesCompiled).toBe(false)
    })

    test('compiles resources only once (idempotent)', () => {
      mockServerless.service.ai = {
        memory: { myMemory: { expiration: 90 } },
      }

      pluginInstance.compileAgentCoreResources()
      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).toHaveBeenCalledTimes(1)
    })

    test('compiles runtime resources from ai.agents', () => {
      mockServerless.service.ai = {
        agents: {
          myAgent: {
            artifact: { image: 'test:latest' },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyAgentRuntime')
      expect(template.Resources).toHaveProperty('MyAgentRuntimeRole')
      expect(template.Outputs).toHaveProperty('MyAgentRuntimeArn')
    })

    test('compiles shared memory resources from ai.memory', () => {
      mockServerless.service.ai = {
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
      mockServerless.service.ai = {
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
            memory: { expiration: 90 },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyRuntimeRuntime')
      expect(template.Resources).toHaveProperty('MyRuntimeDashmemoryMemory')
      expect(template.Resources).toHaveProperty('MyRuntimeDashmemoryMemoryRole')
    })

    test('compiles runtime with shared memory reference', () => {
      mockServerless.service.ai = {
        memory: {
          sharedMem: { expiration: 90 },
        },
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
            memory: 'sharedMem',
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('SharedMemMemory')
      expect(template.Resources).toHaveProperty('MyRuntimeRuntime')
      expect(template.Resources.MyRuntimeRuntime.DependsOn).toContain(
        'SharedMemMemory',
      )
      expect(template.Outputs).toHaveProperty('MyRuntimeRuntimeMemoryArn')
    })

    test('injects BEDROCK_AGENTCORE_MEMORY_ID env var for inline memory', () => {
      mockServerless.service.ai = {
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
            memory: { expiration: 90 },
          },
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
      mockServerless.service.ai = {
        memory: {
          sharedMem: { expiration: 90 },
        },
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
            memory: 'sharedMem',
          },
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
      mockServerless.service.ai = {
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
            memory: { expiration: 90 },
            environment: {
              MY_VAR: 'my-value',
              ANOTHER_VAR: 'another-value',
            },
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

    test('compiles browser resources from ai.browsers', () => {
      mockServerless.service.ai = {
        browsers: {
          myBrowser: {},
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyBrowserBrowser')
    })

    test('compiles codeInterpreter resources from ai.codeInterpreters', () => {
      mockServerless.service.ai = {
        codeInterpreters: {
          myCI: {},
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyCICodeInterpreter')
    })

    test('compiles runtime with endpoints', () => {
      mockServerless.service.ai = {
        agents: {
          myAgent: {
            artifact: { image: 'test:latest' },
            endpoints: [{ name: 'v1', description: 'Version 1' }],
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('MyAgentv1Endpoint')
    })

    test('uses provided role instead of generating role', () => {
      mockServerless.service.ai = {
        memory: {
          myMemory: {
            expiration: 90,
            role: 'arn:aws:iam::123456789012:role/CustomRole',
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).not.toHaveProperty('MyMemoryMemoryRole')
    })

    test('logs resource summary', () => {
      mockServerless.service.ai = {
        memory: { myMemory: { expiration: 90 } },
        agents: {
          myRuntime: {
            artifact: { image: 'test:latest' },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      expect(mockUtils.log.info).toHaveBeenCalledWith(
        expect.stringContaining('runtime(s)'),
      )
    })
  })

  describe('displayDeploymentInfo', () => {
    test('returns early when no ai config', async () => {
      await pluginInstance.displayDeploymentInfo()

      expect(mockUtils.log.notice).not.toHaveBeenCalled()
    })

    test('completes without logging when resources exist', async () => {
      mockServerless.service.ai = {
        agents: { myAgent: { artifact: { image: 'test' } } },
      }

      await pluginInstance.displayDeploymentInfo()

      expect(mockUtils.log.notice).not.toHaveBeenCalled()
    })
  })

  describe('tools functionality', () => {
    describe('collectAllTools', () => {
      test('returns hasTools false when no tools defined', () => {
        const aiConfig = {
          agents: { myRuntime: { artifact: { image: 'test' } } },
        }

        const result = collectAllTools(aiConfig)

        expect(result.hasTools).toBe(false)
        expect(result.hasGateways).toBe(false)
        expect(result.sharedTools).toEqual({})
      })

      test('returns hasTools true when shared tools defined in ai.tools', () => {
        const aiConfig = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
          agents: { myRuntime: { artifact: { image: 'test' } } },
        }

        const result = collectAllTools(aiConfig)

        expect(result.hasTools).toBe(true)
        expect(result.hasGateways).toBe(false)
        expect(result.sharedTools).toEqual({
          myTool: { mcp: 'https://example.com/mcp' },
        })
      })

      test('returns hasGateways true when gateways defined in ai.gateways', () => {
        const aiConfig = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
          gateways: {
            myGateway: { authorizer: 'AWS_IAM', tools: ['myTool'] },
          },
          agents: { myRuntime: { artifact: { image: 'test' } } },
        }

        const result = collectAllTools(aiConfig)

        expect(result.hasTools).toBe(true)
        expect(result.hasGateways).toBe(true)
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

      test('throws error for OAUTH credentials missing provider', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            mcp: 'https://example.com/mcp',
            credentials: { type: 'OAUTH', scopes: ['read'] },
          }),
        ).toThrow("Tool 'myTool' OAUTH credentials require provider and scopes")
      })

      test('throws error for API_KEY credentials missing provider', () => {
        expect(() =>
          pluginInstance.validateToolConfig('myTool', {
            mcp: 'https://example.com/mcp',
            credentials: { type: 'API_KEY' },
          }),
        ).toThrow("Tool 'myTool' API_KEY credentials require provider")
      })
    })

    describe('validateConfig with tools', () => {
      test('throws error when shared tool is a string reference', () => {
        mockServerless.service.ai = {
          tools: { myTool: 'some-ref' },
        }

        expect(() => pluginInstance.validateConfig()).toThrow(
          "Shared tool 'myTool' cannot be a reference - define it inline",
        )
      })

      test('validates successfully with valid shared tool', () => {
        mockServerless.service.ai = {
          tools: { sharedMcp: { mcp: 'https://example.com/mcp' } },
          agents: {
            myRuntime: {
              artifact: { image: 'test' },
            },
          },
        }

        expect(() => pluginInstance.validateConfig()).not.toThrow()
      })
    })

    describe('compileAgentCoreResources with tools', () => {
      test('creates gateway when shared tools exist in ai.tools', () => {
        mockServerless.service.ai = {
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

      test('does not create gateway when no tools', () => {
        mockServerless.service.ai = {
          agents: {
            myRuntime: {
              artifact: { image: 'test:latest' },
            },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Resources.AgentCoreGateway).toBeUndefined()
      })

      test('adds gateway outputs', () => {
        mockServerless.service.ai = {
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
        mockServerless.service.ai = {
          tools: {
            'my-mcp': { mcp: 'https://example.com/mcp' },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate

        expect(template.Resources.MyDashmcpTool).toBeDefined()
        expect(template.Resources.MyDashmcpTool.Type).toBe(
          'AWS::BedrockAgentCore::GatewayTarget',
        )
      })
    })

    describe('env var injection', () => {
      test('injects BEDROCK_AGENTCORE_GATEWAY_URL when shared tools exist (backwards compat)', () => {
        mockServerless.service.ai = {
          tools: { myTool: { mcp: 'https://example.com/mcp' } },
          agents: {
            myRuntime: {
              artifact: { image: 'test-image:latest' },
            },
          },
        }

        pluginInstance.compileAgentCoreResources()
        const template =
          mockServerless.service.provider.compiledCloudFormationTemplate
        const runtime = template.Resources.MyRuntimeRuntime

        expect(runtime.Properties.EnvironmentVariables).toHaveProperty(
          'BEDROCK_AGENTCORE_GATEWAY_URL',
        )
        expect(
          runtime.Properties.EnvironmentVariables.BEDROCK_AGENTCORE_GATEWAY_URL,
        ).toEqual({ 'Fn::GetAtt': ['AgentCoreGateway', 'GatewayUrl'] })
      })

      test('does not inject gateway URL when no shared tools', () => {
        mockServerless.service.ai = {
          agents: {
            myRuntime: {
              artifact: { image: 'test-image:latest' },
            },
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

  describe('normalizeAuthorizer', () => {
    test('returns default AWS_IAM for null', () => {
      const result = normalizeAuthorizer(null)
      expect(result).toEqual({ type: 'AWS_IAM' })
    })

    test('returns default AWS_IAM for undefined', () => {
      const result = normalizeAuthorizer(undefined)
      expect(result).toEqual({ type: 'AWS_IAM' })
    })

    test('converts string shorthand to object', () => {
      const result = normalizeAuthorizer('NONE')
      expect(result).toEqual({ type: 'NONE' })
    })

    test('converts AWS_IAM string to object', () => {
      const result = normalizeAuthorizer('AWS_IAM')
      expect(result).toEqual({ type: 'AWS_IAM' })
    })

    test('converts CUSTOM_JWT string to object', () => {
      const result = normalizeAuthorizer('CUSTOM_JWT')
      expect(result).toEqual({ type: 'CUSTOM_JWT' })
    })

    test('converts lowercase string to uppercase', () => {
      const result = normalizeAuthorizer('none')
      expect(result).toEqual({ type: 'NONE' })
    })

    test('passes through object form with type normalized to uppercase', () => {
      const input = {
        type: 'custom_jwt',
        jwt: {
          discoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      }
      const result = normalizeAuthorizer(input)
      expect(result.type).toBe('CUSTOM_JWT')
      expect(result.jwt).toEqual(input.jwt)
    })
  })

  describe('collectGateways', () => {
    test('returns empty object when no gateways defined', () => {
      const aiConfig = {
        tools: { 'my-tool': { function: 'myFunc' } },
      }
      const result = collectGateways(aiConfig)

      expect(result).toEqual({})
    })

    test('collects gateways from ai.gateways with normalized authorizers', () => {
      const aiConfig = {
        gateways: {
          publicGateway: {
            authorizer: 'NONE',
            tools: ['tool1'],
          },
          privateGateway: {
            authorizer: { type: 'AWS_IAM' },
            tools: ['tool2'],
          },
        },
      }
      const result = collectGateways(aiConfig)

      expect(result.publicGateway.authorizer).toEqual({ type: 'NONE' })
      expect(result.publicGateway.tools).toEqual(['tool1'])
      expect(result.privateGateway.authorizer).toEqual({ type: 'AWS_IAM' })
      expect(result.privateGateway.tools).toEqual(['tool2'])
    })
  })

  describe('collectAllTools with gateways', () => {
    test('returns hasGateways false when no gateways in ai', () => {
      const aiConfig = {
        tools: { 'my-tool': { function: 'myFunc' } },
      }
      const result = collectAllTools(aiConfig)

      expect(result.hasGateways).toBe(false)
      expect(result.hasTools).toBe(true)
    })

    test('returns hasGateways true when gateways defined in ai.gateways', () => {
      const aiConfig = {
        tools: { 'my-tool': { function: 'myFunc' } },
        gateways: {
          myGateway: { authorizer: 'AWS_IAM', tools: ['my-tool'] },
        },
      }
      const result = collectAllTools(aiConfig)

      expect(result.hasGateways).toBe(true)
      expect(result.hasTools).toBe(true)
    })
  })

  describe('multi-gateway compilation', () => {
    beforeEach(() => {
      mockServerless.service.provider.compiledCloudFormationTemplate = {
        Resources: {},
        Outputs: {},
      }
      mockServerless.service.functions = {
        calculator: { handler: 'calculator.handler' },
      }
    })

    test('creates multiple gateways when ai.gateways defined', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        gateways: {
          publicGateway: { authorizer: 'NONE', tools: ['calc-tool'] },
          privateGateway: { authorizer: 'AWS_IAM', tools: ['calc-tool'] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('AgentCoreGatewayPublicGateway')
      expect(template.Resources).toHaveProperty(
        'AgentCoreGatewayPrivateGateway',
      )
    })

    test('creates separate GatewayTargets per gateway when same tool in multiple gateways', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        gateways: {
          publicGateway: { authorizer: 'NONE', tools: ['calc-tool'] },
          privateGateway: { authorizer: 'AWS_IAM', tools: ['calc-tool'] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('CalcDashtoolToolPublicGateway')
      expect(template.Resources).toHaveProperty(
        'CalcDashtoolToolPrivateGateway',
      )
    })

    test('backwards compat: creates default gateway when no gateways but tools exist', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources).toHaveProperty('AgentCoreGateway')
      expect(template.Resources).not.toHaveProperty(
        'AgentCoreGatewayPublicGateway',
      )
    })
  })

  describe('agent gateway selection', () => {
    beforeEach(() => {
      mockServerless.service.provider.compiledCloudFormationTemplate = {
        Resources: {},
        Outputs: {},
      }
      mockServerless.service.functions = {
        calculator: { handler: 'calculator.handler' },
      }
    })

    test('injects GATEWAY_URL when agent specifies gateway', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        gateways: {
          privateGateway: { authorizer: 'AWS_IAM', tools: ['calc-tool'] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
            gateway: 'privateGateway',
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyAgentRuntime
      expect(runtime.Properties.EnvironmentVariables).toHaveProperty(
        'BEDROCK_AGENTCORE_GATEWAY_URL',
      )
    })

    test('does NOT inject GATEWAY_URL when agent does not specify gateway in multi-gateway mode', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        gateways: {
          privateGateway: { authorizer: 'AWS_IAM', tools: ['calc-tool'] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyAgentRuntime
      const envVars = runtime.Properties.EnvironmentVariables || {}
      expect(envVars.BEDROCK_AGENTCORE_GATEWAY_URL).toBeUndefined()
    })

    test('backwards compat: injects GATEWAY_URL for all agents when no gateways but tools exist', () => {
      mockServerless.service.ai = {
        tools: {
          'calc-tool': { function: 'calculator', toolSchema: [] },
        },
        agents: {
          myAgent: {
            artifact: {
              image:
                '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest',
            },
          },
        },
      }

      pluginInstance.compileAgentCoreResources()

      const template =
        mockServerless.service.provider.compiledCloudFormationTemplate
      const runtime = template.Resources.MyAgentRuntime
      expect(runtime.Properties.EnvironmentVariables).toHaveProperty(
        'BEDROCK_AGENTCORE_GATEWAY_URL',
      )
    })
  })
})
