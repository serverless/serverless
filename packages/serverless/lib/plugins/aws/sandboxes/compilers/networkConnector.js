import { getResourceName } from '../utils/naming.js'

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
 * @param {string} name    - Sandbox runner name
 * @param {object} vpcCfg  - VPC configuration: { subnets, securityGroups, protocol }
 * @param {object} ctx     - Deployment context: { serviceName, stage, region, operatorRoleArn }
 * @returns {object} CloudFormation AWS::Lambda::NetworkConnector resource object
 */
export function compileNetworkConnector(name, vpcCfg, ctx) {
  const Name = getResourceName(ctx.serviceName, name, ctx.stage)
  return {
    Type: 'AWS::Lambda::NetworkConnector',
    Properties: {
      Name,
      Configuration: {
        VpcEgressConfiguration: {
          SubnetIds: vpcCfg.subnetIds,
          SecurityGroupIds: vpcCfg.securityGroupIds,
          NetworkProtocol: normalizeProtocol(vpcCfg.protocol),
          AssociatedComputeResourceTypes: ['MicroVm'],
        },
      },
      OperatorRole: ctx.operatorRoleArn,
    },
  }
}
