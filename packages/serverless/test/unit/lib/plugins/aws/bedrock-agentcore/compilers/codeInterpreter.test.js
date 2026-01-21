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
        networkMode: 'PUBLIC',
      }

      const result = buildCodeInterpreterNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'PUBLIC',
      })
    })

    test('handles VPC mode with VpcConfig', () => {
      const network = {
        networkMode: 'VPC',
        vpcConfig: {
          subnets: ['subnet-123', 'subnet-456'],
          securityGroups: ['sg-789'],
        },
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

    test('does not include VpcConfig for SANDBOX mode', () => {
      const network = {
        networkMode: 'SANDBOX',
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
      const config = {
        type: 'codeInterpreter',
      }

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
        type: 'codeInterpreter',
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

    test('uses provided roleArn when specified', () => {
      const config = {
        type: 'codeInterpreter',
        roleArn: 'arn:aws:iam::123456789012:role/MyCustomRole',
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

    test('includes network configuration with VPC', () => {
      const config = {
        type: 'codeInterpreter',
        network: {
          networkMode: 'VPC',
          vpcConfig: {
            subnets: ['subnet-123'],
            securityGroups: ['sg-456'],
          },
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
      const config = {
        type: 'codeInterpreter',
      }

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
