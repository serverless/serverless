import { compileNetworkConnector } from '../../../../../../../lib/plugins/aws/sandboxes/compilers/networkConnector.js'

const ctx = {
  serviceName: 'svc',
  stage: 'dev',
  region: 'us-east-1',
  operatorRoleArn: { 'Fn::GetAtt': ['RunnerConnectorOperatorRole', 'Arn'] },
}

describe('compileNetworkConnector', () => {
  test('emits AWS::Lambda::NetworkConnector type', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'ipv4' },
      ctx,
    )
    expect(r.Type).toBe('AWS::Lambda::NetworkConnector')
  })

  test('sets SubnetIds from vpcCfg.subnetIds', () => {
    const r = compileNetworkConnector(
      'runner',
      {
        subnetIds: ['subnet-1', 'subnet-2'],
        securityGroupIds: ['sg-1'],
        protocol: 'ipv4',
      },
      ctx,
    )
    expect(r.Properties.Configuration.VpcEgressConfiguration.SubnetIds).toEqual(
      ['subnet-1', 'subnet-2'],
    )
  })

  test('sets SecurityGroupIds from vpcCfg.securityGroupIds', () => {
    const r = compileNetworkConnector(
      'runner',
      {
        subnetIds: ['subnet-1'],
        securityGroupIds: ['sg-1', 'sg-2'],
        protocol: 'ipv4',
      },
      ctx,
    )
    expect(
      r.Properties.Configuration.VpcEgressConfiguration.SecurityGroupIds,
    ).toEqual(['sg-1', 'sg-2'])
  })

  test('normalizes ipv4 protocol to IPv4', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'ipv4' },
      ctx,
    )
    expect(
      r.Properties.Configuration.VpcEgressConfiguration.NetworkProtocol,
    ).toBe('IPv4')
  })

  test('normalizes dualstack protocol to DualStack', () => {
    const r = compileNetworkConnector(
      'runner',
      {
        subnetIds: ['subnet-1'],
        securityGroupIds: ['sg-1'],
        protocol: 'dualstack',
      },
      ctx,
    )
    expect(
      r.Properties.Configuration.VpcEgressConfiguration.NetworkProtocol,
    ).toBe('DualStack')
  })

  test('normalizes IPv4 (already cased) to IPv4', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'IPv4' },
      ctx,
    )
    expect(
      r.Properties.Configuration.VpcEgressConfiguration.NetworkProtocol,
    ).toBe('IPv4')
  })

  test('sets AssociatedComputeResourceTypes to [MicroVm]', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'ipv4' },
      ctx,
    )
    expect(
      r.Properties.Configuration.VpcEgressConfiguration
        .AssociatedComputeResourceTypes,
    ).toEqual(['MicroVm'])
  })

  test('sets OperatorRole from ctx.operatorRoleArn', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'ipv4' },
      ctx,
    )
    expect(r.Properties.OperatorRole).toEqual(ctx.operatorRoleArn)
  })

  test('Name is derived via getResourceName', () => {
    const r = compileNetworkConnector(
      'runner',
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'], protocol: 'ipv4' },
      ctx,
    )
    expect(r.Properties.Name).toBe('svc-runner-dev')
  })
})
