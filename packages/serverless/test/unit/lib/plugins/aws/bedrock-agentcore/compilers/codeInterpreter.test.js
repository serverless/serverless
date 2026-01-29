'use strict'

import {
  compileCodeInterpreter,
  buildCodeInterpreterNetworkConfiguration,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/codeInterpreter.js'

describe('CodeInterpreter Compiler', () => {
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
    'agentcore:resource': 'myCodeInterpreter',
  }

  describe('buildCodeInterpreterNetworkConfiguration', () => {
    test('defaults to SANDBOX network mode', () => {
      const result = buildCodeInterpreterNetworkConfiguration()

      expect(result).toEqual({
        NetworkMode: 'SANDBOX',
      })
    })

    test('handles PUBLIC mode', () => {
      const network = {
        mode: 'PUBLIC',
      }

      const result = buildCodeInterpreterNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'PUBLIC',
      })
    })

    test('handles VPC mode with flat structure', () => {
      const network = {
        mode: 'VPC',
        subnets: ['subnet-123', 'subnet-456'],
        securityGroups: ['sg-789'],
      }

      const result = buildCodeInterpreterNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'VPC',
        VpcConfig: {
          Subnets: ['subnet-123', 'subnet-456'],
          SecurityGroups: ['sg-789'],
        },
      })
    })

    test('handles lowercase mode (case-insensitive)', () => {
      const network = {
        mode: 'sandbox',
      }

      const result = buildCodeInterpreterNetworkConfiguration(network)

      expect(result.NetworkMode).toBe('SANDBOX')
    })

    test('does not include VpcConfig for SANDBOX mode', () => {
      const network = {
        mode: 'SANDBOX',
      }

      const result = buildCodeInterpreterNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'SANDBOX',
      })
      expect(result.VpcConfig).toBeUndefined()
    })
  })

  describe('compileCodeInterpreter', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {}

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::CodeInterpreterCustom')
      expect(result.Properties.Name).toBe('test_service_myCodeInterpreter_dev')
      expect(result.Properties.NetworkConfiguration).toEqual({
        NetworkMode: 'SANDBOX',
      })
      expect(result.Properties.ExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyCodeInterpreterCodeInterpreterRole', 'Arn'],
      })
    })

    test('includes description when provided', () => {
      const config = {
        description: 'Test code interpreter description',
      }

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.Description).toBe(
        'Test code interpreter description',
      )
    })

    test('uses provided role when specified as ARN', () => {
      const config = {
        role: 'arn:aws:iam::123456789012:role/MyCustomRole',
      }

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.ExecutionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('uses provided role when specified as logical name', () => {
      const config = {
        role: 'MyCustomRoleLogicalId',
      }

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.ExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyCustomRoleLogicalId', 'Arn'],
      })
    })

    test('includes network configuration with VPC (flat structure)', () => {
      const config = {
        network: {
          mode: 'VPC',
          subnets: ['subnet-123'],
          securityGroups: ['sg-456'],
        },
      }

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.NetworkConfiguration).toEqual({
        NetworkMode: 'VPC',
        VpcConfig: {
          Subnets: ['subnet-123'],
          SecurityGroups: ['sg-456'],
        },
      })
    })

    test('includes tags when provided', () => {
      const config = {}

      const result = compileCodeInterpreter(
        'myCodeInterpreter',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.Tags).toEqual(baseTags)
    })
  })
})
