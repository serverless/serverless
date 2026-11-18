import {
  compileNetworkConnector,
  generateOperatorRole,
} from '../../../../../../lib/plugins/aws/lib/network-connector.js'

const operatorRoleArn = { 'Fn::GetAtt': ['RunnerConnectorOperatorRole', 'Arn'] }

const compile = (vpcCfg, overrides = {}) =>
  compileNetworkConnector({
    physicalName: 'svc-runner-dev',
    vpcCfg,
    operatorRoleArn,
    computeResourceType: 'MicroVm',
    ...overrides,
  })

const egressOf = (resource) =>
  resource.Properties.Configuration.VpcEgressConfiguration

describe('compileNetworkConnector', () => {
  test('emits AWS::Lambda::NetworkConnector type', () => {
    const r = compile({
      subnetIds: ['subnet-1'],
      securityGroupIds: ['sg-1'],
      protocol: 'ipv4',
    })
    expect(r.Type).toBe('AWS::Lambda::NetworkConnector')
  })

  test('sets SubnetIds from vpcCfg.subnetIds', () => {
    const r = compile({
      subnetIds: ['subnet-1', 'subnet-2'],
      securityGroupIds: ['sg-1'],
      protocol: 'ipv4',
    })
    expect(egressOf(r).SubnetIds).toEqual(['subnet-1', 'subnet-2'])
  })

  test('sets SecurityGroupIds from vpcCfg.securityGroupIds', () => {
    const r = compile({
      subnetIds: ['subnet-1'],
      securityGroupIds: ['sg-1', 'sg-2'],
      protocol: 'ipv4',
    })
    expect(egressOf(r).SecurityGroupIds).toEqual(['sg-1', 'sg-2'])
  })

  test('passes intrinsic subnet and security group lists through', () => {
    const subnetIds = { 'Fn::Split': [',', { Ref: 'Subnets' }] }
    const securityGroupIds = [{ Ref: 'SecurityGroup' }]
    const r = compile({ subnetIds, securityGroupIds })
    expect(egressOf(r).SubnetIds).toEqual(subnetIds)
    expect(egressOf(r).SecurityGroupIds).toEqual(securityGroupIds)
  })

  test('normalizes ipv4 protocol to IPv4', () => {
    const r = compile({
      subnetIds: ['subnet-1'],
      securityGroupIds: ['sg-1'],
      protocol: 'ipv4',
    })
    expect(egressOf(r).NetworkProtocol).toBe('IPv4')
  })

  test('normalizes dualstack protocol to DualStack', () => {
    const r = compile({
      subnetIds: ['subnet-1'],
      securityGroupIds: ['sg-1'],
      protocol: 'dualstack',
    })
    expect(egressOf(r).NetworkProtocol).toBe('DualStack')
  })

  test('normalizes IPv4 (already cased) to IPv4', () => {
    const r = compile({
      subnetIds: ['subnet-1'],
      securityGroupIds: ['sg-1'],
      protocol: 'IPv4',
    })
    expect(egressOf(r).NetworkProtocol).toBe('IPv4')
  })

  test('defaults a missing protocol to IPv4', () => {
    const r = compile({ subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] })
    expect(egressOf(r).NetworkProtocol).toBe('IPv4')
  })

  test('sets AssociatedComputeResourceTypes to [MicroVm] for sandboxes', () => {
    const r = compile({ subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] })
    expect(egressOf(r).AssociatedComputeResourceTypes).toEqual(['MicroVm'])
  })

  test('sets AssociatedComputeResourceTypes to [WebFunction] for web apps', () => {
    const r = compile(
      { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] },
      { computeResourceType: 'WebFunction', physicalName: 'shop-dev-vpc' },
    )
    expect(egressOf(r).AssociatedComputeResourceTypes).toEqual(['WebFunction'])
    expect(r.Properties.Name).toBe('shop-dev-vpc')
  })

  test('sets OperatorRole from operatorRoleArn', () => {
    const r = compile({ subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] })
    expect(r.Properties.OperatorRole).toEqual(operatorRoleArn)
  })

  test('Name is the physicalName', () => {
    const r = compile({ subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] })
    expect(r.Properties.Name).toBe('svc-runner-dev')
  })
})

describe('generateOperatorRole', () => {
  const role = () =>
    generateOperatorRole({ policyName: 'sandboxes-network-connector-policy' })
  const statements = (r) => r.Properties.Policies[0].PolicyDocument.Statement

  test('returns AWS::IAM::Role type', () => {
    expect(role().Type).toBe('AWS::IAM::Role')
  })

  test('names the inline policy policyName', () => {
    const r = generateOperatorRole({ policyName: 'x' })
    expect(r.Properties.Policies).toHaveLength(1)
    expect(r.Properties.Policies[0].PolicyName).toBe('x')
  })

  test('trust principal is network-connectors.lambda.amazonaws.com', () => {
    const stmt = role().Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Principal.Service).toBe(
      'network-connectors.lambda.amazonaws.com',
    )
    expect(stmt.Action).toBe('sts:AssumeRole')
    expect(stmt.Effect).toBe('Allow')
  })

  test('trust policy has NO aws:SourceAccount condition (network-connectors service cannot assume it otherwise)', () => {
    // Unlike the build/exec roles (lambda.amazonaws.com), the
    // network-connectors.lambda.amazonaws.com service does not present
    // SourceAccount; adding the condition makes the connector deploy fail with
    // "unable to assume the provided NetworkConnectorOperatorRole".
    const stmt = role().Properties.AssumeRolePolicyDocument.Statement[0]
    expect(stmt.Condition).toBeUndefined()
  })

  test('has ec2:CreateNetworkInterface permission', () => {
    const stmt = statements(role()).find((s) =>
      [s.Action].flat().includes('ec2:CreateNetworkInterface'),
    )
    expect(stmt).toBeDefined()
    expect(stmt.Effect).toBe('Allow')
  })

  test('ec2:CreateNetworkInterface resources cover network-interface, subnet, security-group', () => {
    const stmt = statements(role()).find((s) =>
      [s.Action].flat().includes('ec2:CreateNetworkInterface'),
    )
    const combined = [stmt.Resource]
      .flat()
      .map((r) => (typeof r === 'string' ? r : r['Fn::Sub']))
      .join(' ')
    expect(combined).toContain('network-interface')
    expect(combined).toContain('subnet')
    expect(combined).toContain('security-group')
  })

  test('ec2:CreateTags has ec2:ManagedResourceOperator StringEquals condition', () => {
    const stmt = statements(role()).find((s) =>
      [s.Action].flat().includes('ec2:CreateTags'),
    )
    expect(stmt.Effect).toBe('Allow')
    expect(stmt.Condition.StringEquals['ec2:ManagedResourceOperator']).toBe(
      'network-connectors.lambda.amazonaws.com',
    )
  })

  test('ec2:CreateTags is scoped to network-interface ARNs, not "*"', () => {
    const stmt = statements(role()).find((s) =>
      [s.Action].flat().includes('ec2:CreateTags'),
    )
    expect(stmt.Resource).not.toBe('*')
    expect(stmt.Resource['Fn::Sub']).toContain('network-interface/*')
  })

  test('returns a fresh object on every call', () => {
    const a = role()
    statements(a).push({ Effect: 'Allow', Action: 'x', Resource: '*' })
    expect(statements(role())).toHaveLength(2)
  })
})
