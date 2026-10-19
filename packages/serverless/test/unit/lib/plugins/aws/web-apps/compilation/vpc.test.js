import { describe, expect, it } from '@jest/globals'
import { compileWebApps } from '../../../../../../../lib/plugins/aws/web-apps/compilation/orchestrator.js'
import { givenContext, givenProvider } from '../given.js'

const providerVpc = {
  securityGroupIds: ['sg-provider'],
  subnetIds: ['subnet-provider-a', 'subnet-provider-b'],
}

const compile = ({ webApps, providerConfig = {} }) => {
  const provider = givenProvider(providerConfig)
  const template = {
    Resources: {
      IamRoleLambdaExecution: { Type: 'AWS::IAM::Role', Properties: {} },
    },
  }
  compileWebApps({
    webApps,
    ctx: givenContext(),
    template,
    artifacts: new Map(
      Object.keys(webApps).map((name) => [
        name,
        {
          key: `serverless/shop/dev/webapps/${name}-abc.zip`,
          entrypoint: '__sls_web_bootstrap.mjs',
        },
      ]),
    ),
    provider,
    serverless: provider.serverless,
  })
  return template.Resources
}

const idsOfType = (resources, type) =>
  Object.keys(resources).filter((id) => resources[id].Type === type)

const egressOf = (revision) => revision.Properties.ServiceConfig

describe('compileWebApps VPC egress', () => {
  it('compiles one shared connector for every web app that inherits provider.vpc', () => {
    const resources = compile({
      webApps: {
        api: { entry: 'src/api.ts' },
        site: { entry: 'src/site.ts' },
      },
      providerConfig: { vpc: providerVpc },
    })

    expect(idsOfType(resources, 'AWS::Lambda::NetworkConnector')).toEqual([
      'WebAppsNetworkConnector',
    ])
    expect(
      Object.keys(resources).filter((id) => id.includes('OperatorRole')),
    ).toEqual(['WebAppsNetworkConnectorOperatorRole'])

    expect(resources.WebAppsNetworkConnector.Properties).toEqual({
      Name: 'shop-dev-vpc',
      Configuration: {
        VpcEgressConfiguration: {
          SubnetIds: ['subnet-provider-a', 'subnet-provider-b'],
          SecurityGroupIds: ['sg-provider'],
          NetworkProtocol: 'IPv4',
          AssociatedComputeResourceTypes: ['WebFunction'],
        },
      },
      OperatorRole: {
        'Fn::GetAtt': ['WebAppsNetworkConnectorOperatorRole', 'Arn'],
      },
    })
    const role = resources.WebAppsNetworkConnectorOperatorRole
    expect(role.Type).toBe('AWS::IAM::Role')
    expect(role.Properties.Policies[0].PolicyName).toBe(
      'web-apps-network-connector-policy',
    )
    expect(
      role.Properties.AssumeRolePolicyDocument.Statement[0].Principal,
    ).toEqual({ Service: 'network-connectors.lambda.amazonaws.com' })

    for (const revisionId of [
      'ApiWebFunctionRevision',
      'SiteWebFunctionRevision',
    ]) {
      const revision = resources[revisionId]
      expect(egressOf(revision).EgressNetworkConnectorArn).toEqual({
        'Fn::GetAtt': ['WebAppsNetworkConnector', 'LatestVersionArn'],
      })
      expect(revision.DependsOn).toContain('WebAppsNetworkConnector')
    }
  })

  it('gives a web app with its own vpc its own connector and role', () => {
    const resources = compile({
      webApps: {
        api: {
          entry: 'src/api.ts',
          vpc: {
            securityGroupIds: ['sg-api'],
            subnetIds: ['subnet-api-a', 'subnet-api-b'],
          },
        },
        site: { entry: 'src/site.ts' },
      },
      providerConfig: { vpc: providerVpc },
    })

    expect(idsOfType(resources, 'AWS::Lambda::NetworkConnector')).toEqual([
      'WebAppsNetworkConnector',
      'ApiWebFunctionNetworkConnector',
    ])
    const own = resources.ApiWebFunctionNetworkConnector.Properties
    expect(own.Name).toBe('shop-dev-api-vpc')
    expect(own.Configuration.VpcEgressConfiguration).toMatchObject({
      SubnetIds: ['subnet-api-a', 'subnet-api-b'],
      SecurityGroupIds: ['sg-api'],
      NetworkProtocol: 'IPv4',
      AssociatedComputeResourceTypes: ['WebFunction'],
    })
    expect(own.OperatorRole).toEqual({
      'Fn::GetAtt': ['ApiWebFunctionNetworkConnectorOperatorRole', 'Arn'],
    })
    expect(
      resources.ApiWebFunctionNetworkConnectorOperatorRole.Properties
        .Policies[0].PolicyName,
    ).toBe('web-apps-network-connector-policy')

    expect(
      egressOf(resources.ApiWebFunctionRevision).EgressNetworkConnectorArn,
    ).toEqual({
      'Fn::GetAtt': ['ApiWebFunctionNetworkConnector', 'LatestVersionArn'],
    })
    expect(resources.ApiWebFunctionRevision.DependsOn).toContain(
      'ApiWebFunctionNetworkConnector',
    )
    expect(resources.ApiWebFunctionRevision.DependsOn).not.toContain(
      'WebAppsNetworkConnector',
    )
    expect(
      egressOf(resources.SiteWebFunctionRevision).EgressNetworkConnectorArn,
    ).toEqual({
      'Fn::GetAtt': ['WebAppsNetworkConnector', 'LatestVersionArn'],
    })
  })

  it('compiles no shared connector when every web app sets its own vpc', () => {
    const resources = compile({
      webApps: {
        api: { entry: 'src/api.ts', vpc: providerVpc },
      },
      providerConfig: { vpc: providerVpc },
    })

    expect(idsOfType(resources, 'AWS::Lambda::NetworkConnector')).toEqual([
      'ApiWebFunctionNetworkConnector',
    ])
    expect(resources.WebAppsNetworkConnectorOperatorRole).toBeUndefined()
  })

  it('compiles no connector without provider.vpc or an own vpc', () => {
    const resources = compile({
      webApps: { api: { entry: 'src/api.ts' } },
    })

    expect(idsOfType(resources, 'AWS::Lambda::NetworkConnector')).toEqual([])
    expect(idsOfType(resources, 'AWS::IAM::Role')).toEqual([
      'IamRoleLambdaExecution',
    ])
    expect(egressOf(resources.ApiWebFunctionRevision)).not.toHaveProperty(
      'EgressNetworkConnectorArn',
    )
  })

  it('compiles no connector for the empty provider.vpc the functions compiler leaves in a service with functions', () => {
    // compile/functions.js normalises an unset provider.vpc to {} while
    // compiling functions, before web apps compile on the same hook.
    const resources = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      providerConfig: { vpc: {} },
    })

    expect(idsOfType(resources, 'AWS::Lambda::NetworkConnector')).toEqual([])
    expect(idsOfType(resources, 'AWS::IAM::Role')).toEqual([
      'IamRoleLambdaExecution',
    ])
    expect(egressOf(resources.ApiWebFunctionRevision)).not.toHaveProperty(
      'EgressNetworkConnectorArn',
    )
    expect(resources.ApiWebFunctionRevision.DependsOn).toEqual([
      'ApiWebFunction',
    ])
  })

  it('inherits ipv6AllowedForDualStack from provider.vpc for a web app with its own vpc', () => {
    const resources = compile({
      webApps: {
        api: { entry: 'src/api.ts', vpc: providerVpc },
        site: {
          entry: 'src/site.ts',
          vpc: { ...providerVpc, ipv6AllowedForDualStack: false },
        },
      },
      providerConfig: {
        vpc: { ...providerVpc, ipv6AllowedForDualStack: true },
      },
    })

    const protocolOf = (id) =>
      resources[id].Properties.Configuration.VpcEgressConfiguration
        .NetworkProtocol
    expect(protocolOf('ApiWebFunctionNetworkConnector')).toBe('DualStack')
    // The entry's own flag wins, as for functions.
    expect(protocolOf('SiteWebFunctionNetworkConnector')).toBe('IPv4')
  })

  it('passes intrinsic subnet and security group lists through unchanged', () => {
    const subnetIds = { Ref: 'PrivateSubnetIds' }
    const securityGroupIds = {
      'Fn::Split': [',', { 'Fn::ImportValue': 'shared-sgs' }],
    }
    const resources = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      providerConfig: { vpc: { subnetIds, securityGroupIds } },
    })

    expect(
      resources.WebAppsNetworkConnector.Properties.Configuration
        .VpcEgressConfiguration,
    ).toMatchObject({
      SubnetIds: subnetIds,
      SecurityGroupIds: securityGroupIds,
    })
  })

  it('uses DualStack when ipv6AllowedForDualStack is true', () => {
    const resources = compile({
      webApps: {
        api: { entry: 'src/api.ts' },
        site: {
          entry: 'src/site.ts',
          vpc: { ...providerVpc, ipv6AllowedForDualStack: true },
        },
      },
      providerConfig: {
        vpc: { ...providerVpc, ipv6AllowedForDualStack: true },
      },
    })

    for (const id of [
      'WebAppsNetworkConnector',
      'SiteWebFunctionNetworkConnector',
    ]) {
      expect(
        resources[id].Properties.Configuration.VpcEgressConfiguration
          .NetworkProtocol,
      ).toBe('DualStack')
    }
  })

  it('never attaches the VPC access managed policy', () => {
    const resources = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      providerConfig: { vpc: providerVpc },
    })

    expect(JSON.stringify(resources)).not.toContain(
      'AWSLambdaVPCAccessExecutionRole',
    )
  })
})
