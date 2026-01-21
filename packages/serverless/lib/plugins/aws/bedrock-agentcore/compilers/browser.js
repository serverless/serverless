'use strict'

/**
 * AWS::BedrockAgentCore::BrowserCustom CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string
 *   - NetworkConfiguration: { NetworkMode: PUBLIC|VPC (required), VpcConfig? }
 *     - VpcConfig: { Subnets (required), SecurityGroups (required) }
 *
 * Optional Properties:
 *   - Description: string
 *   - ExecutionRoleArn: string, IAM role ARN pattern
 *   - RecordingConfig: { Enabled?: boolean, S3Location?: { Bucket (required), Prefix (required) } }
 *   - BrowserSigning: { Enabled?: boolean }
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - BrowserId, BrowserArn, Status, FailureReason, CreatedAt, LastUpdatedAt
 *
 * Create-Only Properties:
 *   - Name, Description, NetworkConfiguration, RecordingConfig, BrowserSigning, ExecutionRoleArn
 *
 * Network Modes: PUBLIC, VPC
 * Status: CREATING, CREATE_FAILED, READY, DELETING, DELETE_FAILED, DELETED
 */

import { getResourceName, getLogicalId } from '../utils/naming.js'

/**
 * Build network configuration for BrowserCustom
 */
export function buildBrowserNetworkConfiguration(network = {}) {
  const networkMode = network.networkMode || 'PUBLIC'

  const config = {
    NetworkMode: networkMode,
  }

  if (networkMode === 'VPC' && network.vpcConfig) {
    config.VpcConfig = {
      Subnets: network.vpcConfig.subnets,
      SecurityGroups: network.vpcConfig.securityGroups,
    }
  }

  return config
}

/**
 * Build recording configuration for BrowserCustom
 */
export function buildRecordingConfig(recording) {
  if (!recording) {
    return null
  }

  const config = {}

  if (recording.enabled !== undefined) {
    config.Enabled = recording.enabled
  }

  if (recording.s3Location) {
    config.S3Location = {
      Bucket: recording.s3Location.bucket,
      ...(recording.s3Location.prefix && {
        Prefix: recording.s3Location.prefix,
      }),
    }
  }

  return Object.keys(config).length > 0 ? config : null
}

/**
 * Build browser signing configuration
 */
export function buildBrowserSigning(signing) {
  if (!signing) {
    return null
  }

  return { Enabled: signing.enabled || false }
}

/**
 * Compile a BrowserCustom resource to CloudFormation
 */
export function compileBrowser(name, config, context, tags) {
  const { serviceName, stage } = context
  const resourceName = getResourceName(serviceName, name, stage)
  const roleLogicalId = `${getLogicalId(name, 'Browser')}Role`

  const networkConfig = buildBrowserNetworkConfiguration(config.network)
  const recordingConfig = buildRecordingConfig(config.recording)
  const signingConfig = buildBrowserSigning(config.signing)

  return {
    Type: 'AWS::BedrockAgentCore::BrowserCustom',
    Properties: {
      Name: resourceName,
      NetworkConfiguration: networkConfig,
      ...(config.roleArn
        ? { ExecutionRoleArn: config.roleArn }
        : { ExecutionRoleArn: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] } }),
      ...(config.description && { Description: config.description }),
      ...(signingConfig && { BrowserSigning: signingConfig }),
      ...(recordingConfig && { RecordingConfig: recordingConfig }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
