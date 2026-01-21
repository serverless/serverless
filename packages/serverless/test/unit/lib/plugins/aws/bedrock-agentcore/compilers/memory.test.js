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

  const baseTags = {
    'serverless:service': 'test-service',
    'serverless:stage': 'dev',
    'agentcore:resource': 'myMemory',
  }

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
      const config = {
        type: 'memory',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Type).toBe('AWS::BedrockAgentCore::Memory')
      expect(result.Properties.Name).toBe('test_service_myMemory_dev')
      expect(result.Properties.EventExpiryDuration).toBe(30)
      expect(result.Properties.MemoryExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyMemoryMemoryRole', 'Arn'],
      })
    })

    test('uses custom eventExpiryDuration when provided', () => {
      const config = {
        type: 'memory',
        eventExpiryDuration: 90,
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.EventExpiryDuration).toBe(90)
    })

    test('includes description when provided', () => {
      const config = {
        type: 'memory',
        description: 'Test memory description',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.Description).toBe('Test memory description')
    })

    test('includes encryptionKeyArn when provided', () => {
      const config = {
        type: 'memory',
        encryptionKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/12345678',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.EncryptionKeyArn).toBe(
        'arn:aws:kms:us-west-2:123456789012:key/12345678',
      )
    })

    test('uses provided roleArn when specified', () => {
      const config = {
        type: 'memory',
        roleArn: 'arn:aws:iam::123456789012:role/MyCustomRole',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryExecutionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('includes memory strategies when provided', () => {
      const config = {
        type: 'memory',
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
      const config = {
        type: 'memory',
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.Tags).toEqual(baseTags)
    })

    test('omits MemoryStrategies when empty', () => {
      const config = {
        type: 'memory',
        strategies: [],
      }

      const result = compileMemory('myMemory', config, baseContext, baseTags)

      expect(result.Properties.MemoryStrategies).toBeUndefined()
    })
  })
})
