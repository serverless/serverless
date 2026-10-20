/**
 * Normalize a user-supplied vpc.protocol value to the CloudFormation enum.
 *
 * Accepted inputs (case-insensitive): 'ipv4', 'IPv4', 'dualstack', 'DualStack', etc.
 * Returns: 'IPv4' | 'DualStack'
 *
 * @param {string} protocol
 * @returns {string}
 */
function normalizeProtocol(protocol) {
  const lower = (protocol || '').toLowerCase()
  if (lower === 'dualstack') return 'DualStack'
  return 'IPv4'
}

/**
 * Compile an AWS::Lambda::NetworkConnector resource for VPC egress.
 *
 * @param {object} params
 * @param {string} params.physicalName - The connector's `Name`
 * @param {object} params.vpcCfg - VPC configuration: { subnetIds, securityGroupIds, protocol }
 * @param {string|object} params.operatorRoleArn - Operator role ARN or intrinsic
 * @param {'MicroVm'|'WebFunction'} params.computeResourceType - What the connector serves
 * @returns {object} CloudFormation AWS::Lambda::NetworkConnector resource object
 */
export function compileNetworkConnector({
  physicalName,
  vpcCfg,
  operatorRoleArn,
  computeResourceType,
}) {
  return {
    Type: 'AWS::Lambda::NetworkConnector',
    Properties: {
      Name: physicalName,
      Configuration: {
        VpcEgressConfiguration: {
          SubnetIds: vpcCfg.subnetIds,
          SecurityGroupIds: vpcCfg.securityGroupIds,
          NetworkProtocol: normalizeProtocol(vpcCfg.protocol),
          AssociatedComputeResourceTypes: [computeResourceType],
        },
      },
      OperatorRole: operatorRoleArn,
    },
  }
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
 * provided NetworkConnectorOperatorRole").
 *
 * Permissions:
 *   - ec2:CreateNetworkInterface on network-interface / subnet / security-group ARNs
 *   - ec2:CreateTags with ec2:ManagedResourceOperator StringEquals condition
 *
 * @param {object} params
 * @param {string} params.policyName - Name of the role's single inline policy
 * @returns {object} CloudFormation AWS::IAM::Role resource object
 */
export function generateOperatorRole({ policyName }) {
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
          PolicyName: policyName,
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
              // Allow tagging the ENIs the network connector creates. Scoped to
              // network-interface ARNs (matching the AWS-managed
              // AWSLambdaNetworkConnectorOperatorPolicy) and gated by the
              // managed-resource-operator condition.
              {
                Effect: 'Allow',
                Action: ['ec2:CreateTags'],
                Resource: {
                  'Fn::Sub':
                    'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*',
                },
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
