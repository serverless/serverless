'use strict'

import { compileRuntimeEndpoint } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/runtimeEndpoint.js'

describe('RuntimeEndpoint Compiler', () => {
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
    'agentcore:resource': 'myAgent-production',
  }

  describe('compileRuntimeEndpoint', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {
        name: 'production',
      }

      const result = compileRuntimeEndpoint(
        'myAgent',
        'production',
        config,
        'MyagentRuntime',
        baseContext,
        baseTags,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::RuntimeEndpoint')
      expect(result.DependsOn).toEqual(['MyagentRuntime'])
      expect(result.Properties.Name).toBe('test_service_myAgent_production_dev')
      expect(result.Properties.AgentRuntimeId).toEqual({
        'Fn::GetAtt': ['MyagentRuntime', 'AgentRuntimeId'],
      })
    })

    test('includes version when provided', () => {
      const config = {
        name: 'production',
        version: '1',
      }

      const result = compileRuntimeEndpoint(
        'myAgent',
        'production',
        config,
        'MyagentRuntime',
        baseContext,
        baseTags,
      )

      expect(result.Properties.AgentRuntimeVersion).toBe('1')
    })

    test('includes description when provided', () => {
      const config = {
        name: 'production',
        description: 'Production endpoint',
      }

      const result = compileRuntimeEndpoint(
        'myAgent',
        'production',
        config,
        'MyagentRuntime',
        baseContext,
        baseTags,
      )

      expect(result.Properties.Description).toBe('Production endpoint')
    })

    test('includes tags when provided', () => {
      const config = {
        name: 'production',
      }

      const result = compileRuntimeEndpoint(
        'myAgent',
        'production',
        config,
        'MyagentRuntime',
        baseContext,
        baseTags,
      )

      expect(result.Properties.Tags).toEqual(baseTags)
    })

    test('omits Tags when empty', () => {
      const config = {
        name: 'production',
      }

      const result = compileRuntimeEndpoint(
        'myAgent',
        'production',
        config,
        'MyagentRuntime',
        baseContext,
        {},
      )

      expect(result.Properties.Tags).toBeUndefined()
    })

    test('generates combined resource name with agent and endpoint', () => {
      const config = {
        name: 'staging',
      }

      const result = compileRuntimeEndpoint(
        'customerSupport',
        'staging',
        config,
        'CustomerSupportRuntime',
        baseContext,
        {},
      )

      expect(result.Properties.Name).toBe(
        'test_service_customerSupport_staging_dev',
      )
    })
  })
})
