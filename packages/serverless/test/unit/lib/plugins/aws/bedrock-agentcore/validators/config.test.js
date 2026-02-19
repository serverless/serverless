'use strict'

import { describe, it, expect } from '@jest/globals'
import {
  validateGatewayConfig,
  validateRuntime,
  validateToolConfig,
  validateMemoryConfig,
  validateBrowser,
  validateCodeInterpreter,
  isReservedAgentKey,
  getReservedAgentKeys,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/validators/config.js'

describe('validators/config', () => {
  // Helper to capture thrown errors
  const throwError = (message) => {
    throw new Error(message)
  }

  describe('isReservedAgentKey', () => {
    it('should return true for reserved keys', () => {
      expect(isReservedAgentKey('memory')).toBe(true)
      expect(isReservedAgentKey('tools')).toBe(true)
      expect(isReservedAgentKey('gateways')).toBe(true)
      expect(isReservedAgentKey('browsers')).toBe(true)
      expect(isReservedAgentKey('codeInterpreters')).toBe(true)
    })

    it('should return false for non-reserved keys', () => {
      expect(isReservedAgentKey('myAgent')).toBe(false)
      expect(isReservedAgentKey('chatbot')).toBe(false)
      expect(isReservedAgentKey('assistant')).toBe(false)
    })
  })

  describe('getReservedAgentKeys', () => {
    it('should return all reserved keys', () => {
      const keys = getReservedAgentKeys()
      expect(keys).toContain('memory')
      expect(keys).toContain('tools')
      expect(keys).toContain('gateways')
      expect(keys).toContain('browsers')
      expect(keys).toContain('codeInterpreters')
      expect(keys.length).toBe(5)
    })

    it('should return a copy (not the original array)', () => {
      const keys1 = getReservedAgentKeys()
      const keys2 = getReservedAgentKeys()
      keys1.push('test')
      expect(keys2).not.toContain('test')
    })
  })

  describe('validateGatewayConfig', () => {
    it('should pass for valid gateway config', () => {
      const config = {
        tools: ['tool1', 'tool2'],
        authorizer: 'AWS_IAM',
      }
      const sharedTools = { tool1: {}, tool2: {} }

      expect(() =>
        validateGatewayConfig('myGateway', config, sharedTools, throwError),
      ).not.toThrow()
    })

    it('should throw for non-array tools', () => {
      const config = { tools: 'not-an-array' }

      expect(() =>
        validateGatewayConfig('myGateway', config, {}, throwError),
      ).toThrow("Gateway 'myGateway' tools must be an array of tool names")
    })

    it('should throw for undefined tool reference', () => {
      const config = { tools: ['undefined-tool'] }

      expect(() =>
        validateGatewayConfig('myGateway', config, {}, throwError),
      ).toThrow(
        "Gateway 'myGateway' references undefined tool 'undefined-tool'",
      )
    })

    it('should throw for invalid authorizer type', () => {
      const config = { authorizer: 'INVALID' }

      expect(() =>
        validateGatewayConfig('myGateway', config, {}, throwError),
      ).toThrow("Gateway 'myGateway' has invalid authorizer type")
    })
  })

  describe('validateMemoryConfig', () => {
    it('should pass for valid memory config', () => {
      const config = {
        expiration: 30,
        encryptionKey: 'arn:aws:kms:us-east-1:123456789012:key/test',
        strategies: [{ type: 'semantic' }],
      }

      expect(() =>
        validateMemoryConfig('myMemory', config, throwError),
      ).not.toThrow()
    })

    it('should throw for invalid expiration', () => {
      expect(() =>
        validateMemoryConfig('myMemory', { expiration: 2 }, throwError),
      ).toThrow('expiration must be a number between 3 and 365')

      expect(() =>
        validateMemoryConfig('myMemory', { expiration: 400 }, throwError),
      ).toThrow('expiration must be a number between 3 and 365')
    })

    it('should throw for non-string encryptionKey', () => {
      expect(() =>
        validateMemoryConfig('myMemory', { encryptionKey: 123 }, throwError),
      ).toThrow('encryptionKey must be a string')
    })

    it('should throw for non-array strategies', () => {
      expect(() =>
        validateMemoryConfig(
          'myMemory',
          { strategies: 'not-array' },
          throwError,
        ),
      ).toThrow('strategies must be an array')
    })
  })

  describe('validateBrowser', () => {
    it('should pass for valid browser config', () => {
      const config = {
        network: { mode: 'PUBLIC' },
        recording: { s3Location: { bucket: 'my-bucket', prefix: 'sessions/' } },
      }

      expect(() =>
        validateBrowser('myBrowser', config, throwError),
      ).not.toThrow()
    })

    it('should throw for invalid network mode', () => {
      const config = { network: { mode: 'INVALID' } }

      expect(() => validateBrowser('myBrowser', config, throwError)).toThrow(
        "Browser 'myBrowser' has invalid network.mode",
      )
    })

    it('should throw for missing s3Location bucket', () => {
      const config = { recording: { s3Location: {} } }

      expect(() => validateBrowser('myBrowser', config, throwError)).toThrow(
        "Browser 'myBrowser' recording.s3Location must have a 'bucket' property",
      )
    })

    it('should throw for missing s3Location prefix', () => {
      const config = { recording: { s3Location: { bucket: 'my-bucket' } } }

      expect(() => validateBrowser('myBrowser', config, throwError)).toThrow(
        "Browser 'myBrowser' recording.s3Location must have a 'prefix' property",
      )
    })
  })

  describe('validateCodeInterpreter', () => {
    it('should pass for valid codeInterpreter config', () => {
      const config = { network: { mode: 'SANDBOX' } }

      expect(() =>
        validateCodeInterpreter('myCI', config, throwError),
      ).not.toThrow()
    })

    it('should throw for invalid network mode', () => {
      const config = { network: { mode: 'INVALID' } }

      expect(() => validateCodeInterpreter('myCI', config, throwError)).toThrow(
        "CodeInterpreter 'myCI' has invalid network.mode",
      )
    })

    it('should throw for VPC mode without subnets', () => {
      const config = { network: { mode: 'VPC' } }

      expect(() => validateCodeInterpreter('myCI', config, throwError)).toThrow(
        "CodeInterpreter 'myCI' requires network.subnets when mode is VPC",
      )
    })
  })

  describe('validateToolConfig', () => {
    it('should pass for valid function tool with schema', () => {
      const config = {
        function: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        toolSchema: { type: 'object' },
      }

      expect(() =>
        validateToolConfig('myTool', config, throwError),
      ).not.toThrow()
    })

    it('should throw for function tool without schema', () => {
      const config = {
        function: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      }

      expect(() => validateToolConfig('myTool', config, throwError)).toThrow(
        "Tool 'myTool' with function type requires toolSchema",
      )
    })

    it('should throw for mcp tool without https URL', () => {
      const config = { mcp: 'http://example.com' }

      expect(() => validateToolConfig('myTool', config, throwError)).toThrow(
        "Tool 'myTool' mcp endpoint must be a valid https:// URL",
      )
    })

    it('should throw for invalid credentials type', () => {
      const config = {
        openapi: './spec.yaml',
        credentials: { type: 'INVALID' },
      }

      expect(() => validateToolConfig('myTool', config, throwError)).toThrow(
        "Tool 'myTool' credentials.type must be one of",
      )
    })
  })

  describe('validateRuntime', () => {
    // Helper for validateMemory callback
    const validateMemory = (name, config, err) =>
      validateMemoryConfig(name, config, err)

    it('should pass for minimal runtime config', () => {
      expect(() =>
        validateRuntime('myRuntime', {}, {}, {}, throwError, validateMemory),
      ).not.toThrow()
    })

    it('should throw for both handler and artifact.image', () => {
      const config = {
        handler: 'agent.py',
        artifact: { image: 'test:latest' },
      }

      expect(() =>
        validateRuntime(
          'myRuntime',
          config,
          {},
          {},
          throwError,
          validateMemory,
        ),
      ).toThrow("cannot specify both 'handler' and 'artifact.image'")
    })

    it('should throw for undefined memory reference', () => {
      const config = { memory: 'nonexistent' }

      expect(() =>
        validateRuntime(
          'myRuntime',
          config,
          {},
          {},
          throwError,
          validateMemory,
        ),
      ).toThrow("references memory 'nonexistent' which is not defined")
    })

    it('should throw for undefined gateway reference', () => {
      const config = { gateway: 'nonexistent' }

      expect(() =>
        validateRuntime(
          'myRuntime',
          config,
          {},
          {},
          throwError,
          validateMemory,
        ),
      ).toThrow('no gateways are defined')
    })

    it('should validate requestHeaders.allowlist length', () => {
      const config = {
        requestHeaders: {
          allowlist: Array(21).fill('header'),
        },
      }

      expect(() =>
        validateRuntime(
          'myRuntime',
          config,
          {},
          {},
          throwError,
          validateMemory,
        ),
      ).toThrow('cannot exceed 20 headers')
    })
  })
})
