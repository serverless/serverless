'use strict'

import { compileWorkloadIdentity } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/workloadIdentity.js'

describe('WorkloadIdentity Compiler', () => {
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
    'agentcore:resource': 'myIdentity',
  }

  describe('compileWorkloadIdentity', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {
        type: 'workloadIdentity',
      }

      const result = compileWorkloadIdentity(
        'myIdentity',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::WorkloadIdentity')
      expect(result.Properties.Name).toBe('test-service-myIdentity-dev')
    })

    test('includes oauth2ReturnUrls when provided', () => {
      const config = {
        type: 'workloadIdentity',
        oauth2ReturnUrls: [
          'https://example.com/callback',
          'https://app.example.com/oauth',
        ],
      }

      const result = compileWorkloadIdentity(
        'myIdentity',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.AllowedResourceOauth2ReturnUrls).toEqual([
        'https://example.com/callback',
        'https://app.example.com/oauth',
      ])
    })

    test('converts tags to array format', () => {
      const config = {
        type: 'workloadIdentity',
      }

      const result = compileWorkloadIdentity(
        'myIdentity',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.Tags).toEqual([
        { Key: 'serverless:service', Value: 'test-service' },
        { Key: 'serverless:stage', Value: 'dev' },
        { Key: 'agentcore:resource', Value: 'myIdentity' },
      ])
    })

    test('omits Tags when empty', () => {
      const config = {
        type: 'workloadIdentity',
      }

      const result = compileWorkloadIdentity(
        'myIdentity',
        config,
        baseContext,
        {},
      )

      expect(result.Properties.Tags).toBeUndefined()
    })

    test('generates name with hyphens instead of underscores', () => {
      const config = {
        type: 'workloadIdentity',
      }

      const context = {
        ...baseContext,
        serviceName: 'my_service',
      }

      const result = compileWorkloadIdentity('my_identity', config, context, {})

      expect(result.Properties.Name).toBe('my-service-my-identity-dev')
    })
  })
})
