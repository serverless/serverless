'use strict'

import {
  getResourceName,
  getGatewayResourceName,
  getGatewayTargetName,
  getWorkloadIdentityName,
  getLogicalId,
  getGatewayLogicalId,
  getNestedLogicalId,
  sanitizeName,
  getNormalizedResourceName,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/naming.js'

describe('Naming Utilities', () => {
  describe('getResourceName', () => {
    test('generates resource name with service, name, and stage', () => {
      const result = getResourceName('my-service', 'myAgent', 'dev')
      expect(result).toBe('my_service_myAgent_dev')
    })

    test('replaces hyphens with underscores', () => {
      const result = getResourceName('my-app', 'customer-support', 'prod')
      expect(result).toBe('my_app_customer_support_prod')
    })

    test('removes invalid characters', () => {
      const result = getResourceName('my.service', 'agent@1', 'dev')
      expect(result).toBe('myservice_agent1_dev')
    })

    test('ensures name starts with a letter', () => {
      const result = getResourceName('123service', 'agent', 'dev')
      expect(result).toBe('A123service_agent_dev')
    })

    test('truncates to 48 characters', () => {
      const longName = 'a'.repeat(50)
      const result = getResourceName('service', longName, 'dev')
      expect(result.length).toBeLessThanOrEqual(48)
    })
  })

  describe('getGatewayResourceName', () => {
    test('generates gateway resource name with hyphens', () => {
      const result = getGatewayResourceName('my-service', 'myGateway', 'dev')
      expect(result).toBe('my-service-myGateway-dev')
    })

    test('replaces invalid characters with hyphens', () => {
      const result = getGatewayResourceName('my_service', 'my_gateway', 'dev')
      expect(result).toBe('my-service-my-gateway-dev')
    })

    test('collapses multiple hyphens', () => {
      const result = getGatewayResourceName('my--service', 'gateway', 'dev')
      expect(result).toBe('my-service-gateway-dev')
    })

    test('truncates to 100 characters', () => {
      const longName = 'a'.repeat(100)
      const result = getGatewayResourceName('service', longName, 'dev')
      expect(result.length).toBeLessThanOrEqual(100)
    })
  })

  describe('getGatewayTargetName', () => {
    test('returns target name with hyphens', () => {
      const result = getGatewayTargetName('order-api')
      expect(result).toBe('order-api')
    })

    test('replaces invalid characters', () => {
      const result = getGatewayTargetName('order_api.v2')
      expect(result).toBe('order-api-v2')
    })

    test('truncates to 100 characters', () => {
      const longName = 'a'.repeat(120)
      const result = getGatewayTargetName(longName)
      expect(result.length).toBeLessThanOrEqual(100)
    })
  })

  describe('getWorkloadIdentityName', () => {
    test('generates workload identity name with hyphens', () => {
      const result = getWorkloadIdentityName('my-service', 'myIdentity', 'dev')
      expect(result).toBe('my-service-myIdentity-dev')
    })

    test('converts underscores to hyphens', () => {
      const result = getWorkloadIdentityName('my_service', 'identity', 'dev')
      expect(result).toBe('my-service-identity-dev')
    })
  })

  describe('getLogicalId', () => {
    test('generates logical ID with PascalCase', () => {
      const result = getLogicalId('my-agent', 'Runtime')
      expect(result).toBe('MyDashagentRuntime')
    })

    test('handles underscores', () => {
      const result = getLogicalId('customer_support', 'Memory')
      expect(result).toBe('CustomerUnderscoresupportMemory')
    })

    test('handles mixed separators', () => {
      const result = getLogicalId('my-agent_v2', 'Gateway')
      expect(result).toBe('MyDashagentUnderscorev2Gateway')
    })
  })

  describe('getGatewayLogicalId', () => {
    test('returns default gateway logical ID when no name provided', () => {
      expect(getGatewayLogicalId()).toBe('AgentCoreGateway')
    })

    test('returns default gateway logical ID for undefined', () => {
      expect(getGatewayLogicalId(undefined)).toBe('AgentCoreGateway')
    })

    test('returns default gateway logical ID for null', () => {
      expect(getGatewayLogicalId(null)).toBe('AgentCoreGateway')
    })

    test('returns named gateway logical ID with PascalCase', () => {
      expect(getGatewayLogicalId('publicGateway')).toBe(
        'AgentCoreGatewayPublicGateway',
      )
    })

    test('handles kebab-case gateway names', () => {
      expect(getGatewayLogicalId('public-gateway')).toBe(
        'AgentCoreGatewayPublicGateway',
      )
    })

    test('handles snake_case gateway names', () => {
      expect(getGatewayLogicalId('private_gateway')).toBe(
        'AgentCoreGatewayPrivateGateway',
      )
    })
  })

  describe('getNestedLogicalId', () => {
    test('combines parent and child names', () => {
      const result = getNestedLogicalId('myAgent', 'production', 'Endpoint')
      expect(result).toBe('MyAgentProductionEndpoint')
    })

    test('handles dashes in names', () => {
      const result = getNestedLogicalId(
        'my-agent',
        'prod-endpoint',
        'RuntimeEndpoint',
      )
      expect(result).toBe('MyDashagentProdDashendpointRuntimeEndpoint')
    })
  })

  describe('getNormalizedResourceName', () => {
    test('converts dashes to Dash', () => {
      const result = getNormalizedResourceName('my-agent')
      expect(result).toBe('MyDashagent')
    })

    test('converts underscores to Underscore', () => {
      const result = getNormalizedResourceName('my_agent')
      expect(result).toBe('MyUnderscoreagent')
    })
  })

  describe('sanitizeName', () => {
    test('removes non-alphanumeric characters', () => {
      const result = sanitizeName('my-agent_v2.0')
      expect(result).toBe('myagentv20')
    })

    test('keeps alphanumeric characters', () => {
      const result = sanitizeName('MyAgent123')
      expect(result).toBe('MyAgent123')
    })
  })
})
