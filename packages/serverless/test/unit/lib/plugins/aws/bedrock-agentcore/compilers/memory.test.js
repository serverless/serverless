'use strict'

import {
  compileMemory,
  buildMemoryStrategies,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/memory.js'

describe('Memory Compiler', () => {
  const baseContext = {
    serviceName: 'test-service',
    stage: 'dev',
    region: 'us-west-2',
    accountId: '123456789012',
    customConfig: {},
    defaultTags: {},
  }

  const baseTags = {}

  describe('buildMemoryStrategies', () => {
    test('returns null for null strategies', () => {
      const result = buildMemoryStrategies(null)
      expect(result).toBeNull()
    })

    test('returns null for empty strategies array', () => {
      const result = buildMemoryStrategies([])
      expect(result).toBeNull()
    })

    test('returns strategies unchanged', () => {
      const strategies = [
        {
          SemanticMemoryStrategy: {
            Name: 'semantic-strategy',
            Description: 'Semantic memory',
          },
        },
      ]

      const result = buildMemoryStrategies(strategies)

      expect(result).toEqual(strategies)
    })

    test('handles multiple strategies', () => {
      const strategies = [
        {
          SemanticMemoryStrategy: {
            Name: 'semantic',
          },
        },
        {
          SummaryMemoryStrategy: {
            Name: 'summary',
          },
        },
      ]

      const result = buildMemoryStrategies(strategies)

      expect(result).toHaveLength(2)
    })
  })

  describe('compileMemory', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {}

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Type).toBe('AWS::BedrockAgentCore::Memory')
      expect(result.Properties.Name).toBe('test_service_myMemory_dev')
      expect(result.Properties.EventExpiryDuration).toBe(30)
      expect(result.Properties.MemoryExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyMemoryMemoryRole', 'Arn'],
      })
    })

    test('uses custom expiration when provided', () => {
      const config = {
        expiration: 120,
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.EventExpiryDuration).toBe(120)
    })

    test('includes description when provided', () => {
      const config = {
        description: 'Test memory description',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.Description).toBe('Test memory description')
    })

    test('includes encryptionKey when provided', () => {
      const config = {
        encryptionKey: 'arn:aws:kms:us-west-2:123456789012:key/12345678',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.EncryptionKeyArn).toBe(
        'arn:aws:kms:us-west-2:123456789012:key/12345678',
      )
    })

    test('uses provided role when specified as ARN', () => {
      const config = {
        role: 'arn:aws:iam::123456789012:role/MyCustomRole',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryExecutionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('uses provided role when specified as logical name', () => {
      const config = {
        role: 'MyCustomRoleLogicalId',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyCustomRoleLogicalId', 'Arn'],
      })
    })

    test('includes memory strategies when provided', () => {
      const config = {
        strategies: [
          {
            SemanticMemoryStrategy: {
              Name: 'semantic',
              Description: 'Semantic memory strategy',
            },
          },
        ],
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryStrategies).toEqual([
        {
          SemanticMemoryStrategy: {
            Name: 'semantic',
            Description: 'Semantic memory strategy',
          },
        },
      ])
    })

    test('includes tags when provided', () => {
      const config = {}
      const customTags = {
        Environment: 'production',
        Team: 'platform',
      }

      const result = compileMemory('myMemory', config, baseContext, customTags)

      expect(result.Properties.Tags).toEqual(customTags)
    })

    test('omits Tags when no tags provided', () => {
      const config = {}

      const result = compileMemory('myMemory', config, baseContext, {})

      expect(result.Properties.Tags).toBeUndefined()
    })

    test('omits MemoryStrategies when empty', () => {
      const config = {
        strategies: [],
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryStrategies).toBeUndefined()
    })
  })
})
