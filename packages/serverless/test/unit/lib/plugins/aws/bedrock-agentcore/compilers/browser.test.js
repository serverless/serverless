'use strict'

import {
  compileBrowser,
  buildBrowserNetworkConfiguration,
  buildRecordingConfig,
  buildBrowserSigning,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/browser.js'

describe('Browser Compiler', () => {
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
    'agentcore:resource': 'myBrowser',
  }

  describe('buildBrowserNetworkConfiguration', () => {
    test('defaults to PUBLIC network mode', () => {
      const result = buildBrowserNetworkConfiguration()

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

      const result = buildBrowserNetworkConfiguration(network)

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
        mode: 'vpc',
        subnets: ['subnet-123'],
        securityGroups: ['sg-789'],
      }

      const result = buildBrowserNetworkConfiguration(network)

      expect(result.NetworkMode).toBe('VPC')
    })

    test('does not include VpcConfig for PUBLIC mode', () => {
      const network = {
        mode: 'PUBLIC',
      }

      const result = buildBrowserNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'PUBLIC',
      })
      expect(result.VpcConfig).toBeUndefined()
    })
  })

  describe('buildRecordingConfig', () => {
    test('returns null when no recording config', () => {
      const result = buildRecordingConfig(null)
      expect(result).toBeNull()
    })

    test('builds recording config with enabled flag', () => {
      const recording = {
        enabled: true,
      }

      const result = buildRecordingConfig(recording)

      expect(result).toEqual({
        Enabled: true,
      })
    })

    test('builds recording config with S3 location', () => {
      const recording = {
        enabled: true,
        s3Location: {
          bucket: 'my-bucket',
          prefix: 'recordings/',
        },
      }

      const result = buildRecordingConfig(recording)

      expect(result).toEqual({
        Enabled: true,
        S3Location: {
          Bucket: 'my-bucket',
          Prefix: 'recordings/',
        },
      })
    })

    test('builds recording config with bucket only', () => {
      const recording = {
        s3Location: {
          bucket: 'my-bucket',
        },
      }

      const result = buildRecordingConfig(recording)

      expect(result).toEqual({
        S3Location: {
          Bucket: 'my-bucket',
        },
      })
    })

    test('returns null for empty recording config', () => {
      const result = buildRecordingConfig({})
      expect(result).toBeNull()
    })
  })

  describe('buildBrowserSigning', () => {
    test('returns null when no signing config', () => {
      const result = buildBrowserSigning(null)
      expect(result).toBeNull()
    })

    test('builds signing config with enabled true', () => {
      const signing = {
        enabled: true,
      }

      const result = buildBrowserSigning(signing)

      expect(result).toEqual({
        Enabled: true,
      })
    })

    test('builds signing config with enabled false', () => {
      const signing = {
        enabled: false,
      }

      const result = buildBrowserSigning(signing)

      expect(result).toEqual({
        Enabled: false,
      })
    })

    test('defaults to false when enabled not specified', () => {
      const signing = {}

      const result = buildBrowserSigning(signing)

      expect(result).toEqual({
        Enabled: false,
      })
    })
  })

  describe('compileBrowser', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {}

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Type).toBe('AWS::BedrockAgentCore::BrowserCustom')
      expect(result.Properties.Name).toBe('test_service_myBrowser_dev')
      expect(result.Properties.NetworkConfiguration).toEqual({
        NetworkMode: 'PUBLIC',
      })
      expect(result.Properties.ExecutionRoleArn).toEqual({
        'Fn::GetAtt': ['MyBrowserBrowserRole', 'Arn'],
      })
    })

    test('includes description when provided', () => {
      const config = {
        description: 'Test browser description',
      }

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.Description).toBe('Test browser description')
    })

    test('uses provided role when specified as ARN', () => {
      const config = {
        role: 'arn:aws:iam::123456789012:role/MyCustomRole',
      }

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.ExecutionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('uses provided role when specified as logical name', () => {
      const config = {
        role: 'MyCustomRoleLogicalId',
      }

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

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

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.NetworkConfiguration).toEqual({
        NetworkMode: 'VPC',
        VpcConfig: {
          Subnets: ['subnet-123'],
          SecurityGroups: ['sg-456'],
        },
      })
    })

    test('includes recording config when provided', () => {
      const config = {
        recording: {
          enabled: true,
          s3Location: {
            bucket: 'my-bucket',
            prefix: 'recordings/',
          },
        },
      }

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.RecordingConfig).toEqual({
        Enabled: true,
        S3Location: {
          Bucket: 'my-bucket',
          Prefix: 'recordings/',
        },
      })
    })

    test('includes browser signing when provided', () => {
      const config = {
        signing: {
          enabled: true,
        },
      }

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.BrowserSigning).toEqual({
        Enabled: true,
      })
    })

    test('includes tags when provided', () => {
      const config = {}

      const result = compileBrowser('myBrowser', config, baseContext, baseTags)

      expect(result.Properties.Tags).toEqual(baseTags)
    })
  })
})
