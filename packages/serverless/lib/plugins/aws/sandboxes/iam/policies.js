'use strict'

import { getResourceName } from '../utils/naming.js'

/**
 * Determine if an IAM role should be generated for a sandbox resource.
 *
 * Returns false when the caller has provided an explicit role reference:
 *   - an ARN string  (e.g. "arn:aws:iam::…:role/x")
 *   - a CloudFormation intrinsic  (Ref / Fn::GetAtt / Fn::ImportValue / Fn::Sub)
 * Returns true in all other cases (undefined → use defaults, plain object → customization).
 *
 * @param {string|object|undefined} roleCfg - Value of iam.buildRole / iam.executionRole
 * @returns {boolean}
 */
export function shouldGenerateRole(roleCfg) {
  if (!roleCfg) return true
  if (typeof roleCfg === 'string') return false
  if (
    roleCfg.Ref ||
    roleCfg['Fn::GetAtt'] ||
    roleCfg['Fn::ImportValue'] ||
    roleCfg['Fn::Sub']
  ) {
    return false
  }
  return true
}

/**
 * Resolve the final role reference to embed in a CloudFormation resource.
 *
 * - ARN string  → returned verbatim
 * - CF intrinsic (Ref / Fn::GetAtt) → returned verbatim
 * - anything else (undefined, customization object) → Fn::GetAtt on the generated logical ID
 *
 * @param {string|object|undefined} roleCfg
 * @param {string} generatedLogicalId - Logical ID of the generated IAM::Role resource
 * @returns {string|object}
 */
export function resolveRole(roleCfg, generatedLogicalId) {
  if (typeof roleCfg === 'string') return roleCfg
  if (
    roleCfg &&
    (roleCfg.Ref ||
      roleCfg['Fn::GetAtt'] ||
      roleCfg['Fn::ImportValue'] ||
      roleCfg['Fn::Sub'])
  )
    return roleCfg
  return { 'Fn::GetAtt': [generatedLogicalId, 'Arn'] }
}

/**
 * Build the AssumeRolePolicyDocument that allows Lambda to assume a sandbox role.
 * Uses aws:SourceAccount condition to prevent confused deputy attacks.
 *
 * @returns {object} CloudFormation AssumeRolePolicyDocument
 */
function lambdaTrustPolicy() {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }
}

/**
 * Merge user-supplied customizations into a generated role.
 * Mutates the role object in place and returns it.
 *
 * Supported customizations (all optional):
 *   statements        – additional IAM policy statements pushed into the first inline policy
 *   managedPolicies   – list of managed policy ARNs added to ManagedPolicyArns
 *   permissionsBoundary – ARN set as PermissionsBoundary
 *
 * @param {object} role - Generated CloudFormation IAM::Role resource object
 * @param {object|undefined} roleCfg - iam.buildRole / iam.executionRole customization object
 * @returns {object} The mutated role
 */
function withCustomizations(role, roleCfg) {
  if (!roleCfg || typeof roleCfg !== 'object') return role
  // Intrinsics and ARN strings are not customization objects
  if (
    typeof roleCfg === 'string' ||
    roleCfg.Ref ||
    roleCfg['Fn::GetAtt'] ||
    roleCfg['Fn::ImportValue'] ||
    roleCfg['Fn::Sub']
  ) {
    return role
  }

  if (roleCfg.statements && roleCfg.statements.length > 0) {
    // The role may have no base inline policy (e.g. an execution role with
    // logging disabled). Create the policy holder before appending.
    if (!role.Properties.Policies) {
      role.Properties.Policies = [
        {
          PolicyName: 'sandboxes-execution-policy',
          PolicyDocument: { Version: '2012-10-17', Statement: [] },
        },
      ]
    }
    role.Properties.Policies[0].PolicyDocument.Statement.push(
      ...roleCfg.statements,
    )
  }

  if (roleCfg.managedPolicies && roleCfg.managedPolicies.length > 0) {
    role.Properties.ManagedPolicyArns = roleCfg.managedPolicies
  }

  if (roleCfg.permissionsBoundary) {
    role.Properties.PermissionsBoundary = roleCfg.permissionsBoundary
  }

  return role
}

/**
 * Generate the build-phase IAM role for a microVM sandbox runner.
 *
 * Permissions:
 *   - s3:GetObject on the artifact bucket (to fetch the deployment package)
 *     When cfg.artifactBucket differs from ctx.bucket (s3:// passthrough path),
 *     the permission covers BOTH buckets so the role can read the artifact.
 *   - logs:CreateLogGroup / logs:CreateLogStream / logs:PutLogEvents on /aws/lambda-microvms/*
 *
 * @param {string} name - Sandbox runner name
 * @param {object} cfg  - Full sandbox configuration object (may contain cfg.iam.buildRole, cfg.artifactBucket)
 * @param {object} ctx  - Deployment context: { serviceName, stage, region, bucket }
 * @returns {object} CloudFormation AWS::IAM::Role resource object
 */
export function generateBuildRole(name, cfg, ctx) {
  // The log group build logs go to (custom override or default). Scoping the
  // grant to exactly this group keeps the role least-privilege.
  const logGroupName =
    ctx.logGroupName ||
    `/aws/lambda-microvms/${getResourceName(ctx.serviceName, name, ctx.stage)}`
  // Build the s3:GetObject resource(s).  When the artifact lives in a separate
  // bucket (s3:// passthrough path), we must also grant access to that bucket.
  const deployBucketArn = `arn:\${AWS::Partition}:s3:::${ctx.bucket}/*`
  let s3Resource
  if (cfg.artifactBucket && cfg.artifactBucket !== ctx.bucket) {
    const artifactBucketArn = `arn:\${AWS::Partition}:s3:::${cfg.artifactBucket}/*`
    s3Resource = [
      { 'Fn::Sub': deployBucketArn },
      { 'Fn::Sub': artifactBucketArn },
    ]
  } else {
    s3Resource = { 'Fn::Sub': deployBucketArn }
  }

  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: lambdaTrustPolicy(),
      Policies: [
        {
          PolicyName: 'sandboxes-build-policy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              // Fetch the deployment artifact from S3
              {
                Effect: 'Allow',
                Action: ['s3:GetObject'],
                Resource: s3Resource,
              },
              // Write build logs to the microVMs log group
              {
                Effect: 'Allow',
                Action: ['logs:CreateLogGroup', 'logs:CreateLogStream'],
                Resource: {
                  'Fn::Sub': `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:${logGroupName}:*`,
                },
              },
              {
                Effect: 'Allow',
                Action: ['logs:PutLogEvents'],
                Resource: {
                  'Fn::Sub': `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:${logGroupName}:log-stream:*`,
                },
              },
            ],
          },
        },
      ],
    },
  }

  return withCustomizations(role, cfg.iam && cfg.iam.buildRole)
}

/**
 * Generate the execution-phase IAM role for a microVM sandbox runner.
 *
 * Permissions:
 *   - logs:CreateLogGroup / logs:CreateLogStream / logs:PutLogEvents on /aws/lambda-microvms/*
 *
 * @param {string} name - Sandbox runner name
 * @param {object} cfg  - Full sandbox configuration object (may contain cfg.iam.executionRole)
 * @param {object} ctx  - Deployment context: { serviceName, stage, region, bucket }
 * @returns {object} CloudFormation AWS::IAM::Role resource object
 */
export function generateExecutionRole(name, cfg, ctx) {
  // The log group the MicroVM logs to (custom override or default). Scoping the
  // grant to exactly this group keeps the role least-privilege.
  const logGroupName =
    ctx.logGroupName ||
    `/aws/lambda-microvms/${getResourceName(ctx.serviceName, name, ctx.stage)}`
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: lambdaTrustPolicy(),
    },
  }

  // Grant the CloudWatch Logs permissions only when logging is enabled. With
  // `observability.logs.enabled: false` the MicroVM doesn't log, so the role
  // needs no logs:* grant (and an inline policy with no statements is invalid).
  if (!ctx.loggingDisabled) {
    role.Properties.Policies = [
      {
        PolicyName: 'sandboxes-execution-policy',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            // Write execution logs to the microVMs log group
            {
              Effect: 'Allow',
              Action: ['logs:CreateLogGroup', 'logs:CreateLogStream'],
              Resource: {
                'Fn::Sub': `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:${logGroupName}:*`,
              },
            },
            {
              Effect: 'Allow',
              Action: ['logs:PutLogEvents'],
              Resource: {
                'Fn::Sub': `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:${logGroupName}:log-stream:*`,
              },
            },
          ],
        },
      },
    ]
  }

  return withCustomizations(role, cfg.iam && cfg.iam.executionRole)
}

/**
 * Generate the operator IAM role for an AWS::Lambda::NetworkConnector.
 *
 * The trust principal MUST be 'network-connectors.lambda.amazonaws.com' —
 * 'lambda.amazonaws.com' is rejected with "unable to assume the provided
 * NetworkConnectorOperatorRole" at deployment time.
 *
 * NOTE: do NOT add an `aws:SourceAccount` condition here. Unlike the build and
 * execution roles (principal lambda.amazonaws.com), the network-connectors
 * service does not present SourceAccount when assuming this role, so the
 * condition makes the assume-role fail at deploy ("unable to assume the
 * provided NetworkConnectorOperatorRole"). Verified live.
 *
 * Permissions:
 *   - ec2:CreateNetworkInterface on network-interface / subnet / security-group ARNs
 *   - ec2:CreateTags with ec2:ManagedResourceOperator StringEquals condition
 *
 * @param {string} name - Sandbox runner name
 * @param {object} ctx  - Deployment context: { serviceName, stage, region }
 * @returns {object} CloudFormation AWS::IAM::Role resource object
 */
export function generateOperatorRole(name, ctx) {
  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'network-connectors.lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      Policies: [
        {
          PolicyName: 'sandboxes-network-connector-policy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              // Allow creating ENIs in the VPC subnets/security groups
              {
                Effect: 'Allow',
                Action: ['ec2:CreateNetworkInterface'],
                Resource: [
                  {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*',
                  },
                  {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:subnet/*',
                  },
                  {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:security-group/*',
                  },
                ],
              },
              // Allow tagging managed resources created by the network connector
              {
                Effect: 'Allow',
                Action: ['ec2:CreateTags'],
                Resource: '*',
                Condition: {
                  StringEquals: {
                    'ec2:ManagedResourceOperator':
                      'network-connectors.lambda.amazonaws.com',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  }
}
