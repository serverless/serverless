'use strict'

import { resolveBucketRef } from '../../lib/content-addressed-artifacts.js'
import naming from '../../lib/naming.js'
import {
  compileNetworkConnector,
  generateOperatorRole,
} from '../../lib/network-connector.js'
import { getStageScopedName } from '../../lib/resource-naming.js'
import {
  compileWebFunction,
  getWebAppFunctionName,
  getWebAppLogicalIds,
} from '../compilers/function.js'
import { compileRevision } from '../compilers/revision.js'
import { compileEndpoint } from '../compilers/endpoint.js'
import { compileLogGroups } from '../compilers/logGroups.js'
import { compileUrlOutput } from '../compilers/outputs.js'
import { compileWebAppDomains, listWebAppDomains } from '../compilers/domain.js'

/** The connector shared by every web app that inherits `provider.vpc`. */
const SHARED_CONNECTOR_LOGICAL_IDS = {
  networkConnector: 'WebAppsNetworkConnector',
  networkConnectorOperatorRole: 'WebAppsNetworkConnectorOperatorRole',
}

/**
 * Whether a `vpc` (the function shape) puts the compute in a VPC: it names
 * subnets or security groups. An empty object counts as unset, because the
 * functions compiler sets an unset `provider.vpc` to `{}` before web apps
 * compile.
 *
 * @param {object} [vpc]
 * @returns {boolean}
 */
function isVpcConfigured(vpc) {
  return Boolean(vpc?.subnetIds || vpc?.securityGroupIds)
}

/**
 * An egress network connector for one `vpc` (the function shape) and its
 * operator role. Subnet and security group values, intrinsics included, pass
 * through unchanged. No `AWSLambdaVPCAccessExecutionRole` on the execution
 * role: the connector, not the function, creates the network interfaces.
 *
 * @param {object} params
 * @param {object} params.vpc - `securityGroupIds`, `subnetIds`,
 *   `ipv6AllowedForDualStack`
 * @param {boolean} [params.inheritedIpv6AllowedForDualStack] - the provider's
 *   flag, used when `vpc` does not set one (as for functions)
 * @param {string} params.physicalName - the connector's `Name`
 * @param {{ networkConnector: string, networkConnectorOperatorRole: string }} params.logicalIds
 * @returns {Record<string, object>} the two resources by logical ID
 */
function compileVpcEgress({
  vpc,
  inheritedIpv6AllowedForDualStack,
  physicalName,
  logicalIds,
}) {
  const roleId = logicalIds.networkConnectorOperatorRole
  const ipv6AllowedForDualStack =
    vpc.ipv6AllowedForDualStack ?? inheritedIpv6AllowedForDualStack
  return {
    [roleId]: generateOperatorRole({
      policyName: 'web-apps-network-connector-policy',
    }),
    [logicalIds.networkConnector]: compileNetworkConnector({
      physicalName,
      vpcCfg: {
        subnetIds: vpc.subnetIds,
        securityGroupIds: vpc.securityGroupIds,
        protocol: ipv6AllowedForDualStack === true ? 'dualstack' : 'ipv4',
      },
      operatorRoleArn: { 'Fn::GetAtt': [roleId, 'Arn'] },
      computeResourceType: 'WebFunction',
    }),
  }
}

/**
 * Add each web app's resources and URL output to the template: the web
 * function, its revision, its endpoint, its two log groups and
 * `<N>WebFunctionUrl`, plus VPC egress: a web app with its own `vpc` gets its
 * own network connector, and the web apps that inherit `provider.vpc` share
 * one. Web apps that `provider.domain(s)` entries target are served through
 * one CloudFront distribution per hostname, and their endpoints use IAM auth.
 * Only new logical IDs are added; nothing compiled for `functions` is read or
 * changed.
 *
 * @param {object} params
 * @param {Record<string, object>} params.webApps - `webApps`
 * @param {{ serviceName: string, stage: string }} params.ctx
 * @param {{ Resources: object, Outputs?: object }} params.template - mutated
 * @param {Map<string, { key: string, entrypoint: string }>} params.artifacts -
 *   from `collectWebAppArtifacts`, by web app key
 * @param {object} params.provider - the AWS provider
 * @param {object} params.serverless
 * @param {{ warning: Function }} params.log
 */
export function compileWebApps({
  webApps,
  ctx,
  template,
  artifacts,
  provider,
  serverless,
  log,
}) {
  const providerConfig = serverless.service.provider || {}
  const domainEntries = listWebAppDomains(providerConfig)
  const webAppsBehindDomains = new Set(
    domainEntries.map((domain) => domain.webApp),
  )
  // The bucket functions read their code from (the resolved deployment
  // bucket, or the in-stack one).
  const bucketRef = resolveBucketRef(
    serverless.service.package?.deploymentBucket,
  )
  // The in-stack bucket grants Lambda read access in its bucket policy, added
  // in the same stack update, so each revision waits for that policy.
  const bucketPolicyLogicalId = naming.getDeploymentBucketPolicyLogicalId()
  const bucketPolicyDependency =
    typeof bucketRef === 'object' && template.Resources[bucketPolicyLogicalId]
      ? bucketPolicyLogicalId
      : undefined
  template.Outputs = template.Outputs || {}

  // One connector serves every web app without a `vpc` of its own.
  const sharesProviderVpc =
    isVpcConfigured(providerConfig.vpc) &&
    Object.values(webApps).some((webApp) => !isVpcConfigured(webApp.vpc))
  if (sharesProviderVpc) {
    Object.assign(
      template.Resources,
      compileVpcEgress({
        vpc: providerConfig.vpc,
        physicalName: getStageScopedName(ctx.serviceName, ctx.stage, 'vpc'),
        logicalIds: SHARED_CONNECTOR_LOGICAL_IDS,
      }),
    )
  }

  for (const [key, webApp] of Object.entries(webApps)) {
    const functionName = getWebAppFunctionName(ctx, key, webApp)
    const logicalIds = getWebAppLogicalIds(key)

    let egressConnectorLogicalId
    if (isVpcConfigured(webApp.vpc)) {
      Object.assign(
        template.Resources,
        compileVpcEgress({
          vpc: webApp.vpc,
          inheritedIpv6AllowedForDualStack:
            providerConfig.vpc?.ipv6AllowedForDualStack,
          physicalName: getStageScopedName(
            ctx.serviceName,
            ctx.stage,
            `${key}-vpc`,
          ),
          logicalIds,
        }),
      )
      egressConnectorLogicalId = logicalIds.networkConnector
    } else if (sharesProviderVpc) {
      egressConnectorLogicalId = SHARED_CONNECTOR_LOGICAL_IDS.networkConnector
    }

    const { logGroup, localLogGroup } = compileLogGroups({
      functionName,
      webApp,
      provider,
    })

    Object.assign(template.Resources, {
      [logicalIds.webFunction]: compileWebFunction({
        functionName,
        webApp,
        logicalIds,
        providerConfig,
      }),
      [logicalIds.revision]: compileRevision({
        functionName,
        webApp,
        logicalIds,
        artifact: artifacts.get(key),
        bucketRef,
        provider,
        providerConfig,
        egressConnectorLogicalId,
        bucketPolicyLogicalId: bucketPolicyDependency,
      }),
      [logicalIds.endpoint]: compileEndpoint({
        functionName,
        webApp,
        logicalIds,
        behindDomain: webAppsBehindDomains.has(key),
      }),
      [logicalIds.logGroup]: logGroup,
      [logicalIds.localLogGroup]: localLogGroup,
    })
    template.Outputs[logicalIds.urlOutput] = compileUrlOutput({ logicalIds })
  }

  compileWebAppDomains({
    domainEntries,
    webApps,
    ctx,
    providerConfig,
    template,
    log,
  })
}
