'use strict'

import { getLogicalId, truncateWithHash } from '../../lib/resource-naming.js'
import { listDomainEntries } from '../../domains/utils.js'
import WebAppDomainConfig from '../../domains/models/web-app-domain-config.js'
import { getWebAppFunctionName, getWebAppLogicalIds } from './function.js'
import { getEffectiveTimeout } from './revision.js'

/** CloudFront's managed cache policy CachingDisabled. */
const CACHING_DISABLED_POLICY_ID = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
/** CloudFront's managed origin request policy AllViewerExceptHostHeader. */
const ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID =
  'b689b0a8-53d0-40ab-baf2-68738e2966ac'
const ALL_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']
/** The longest `OriginReadTimeout` the Framework sets: CloudFront's default quota, which every account accepts. */
const MAX_ORIGIN_READ_TIMEOUT = 120
/** Seconds CloudFront waits beyond the web app's own timeout. */
const ORIGIN_READ_TIMEOUT_MARGIN = 5

/**
 * A hostname's logical ID: `getLogicalId` applied to the lower-cased hostname
 * with each `.` replaced by `Dot` (`shop.example.com` → `ShopDotexampleDotcom`),
 * so distinct hostnames never share an ID and hostnames that differ only in
 * case share one. A `suffix` stays intact when the name part has to be
 * shortened to fit CloudFormation's 255-character limit.
 *
 * @param {string} hostname
 * @param {string} [suffix]
 * @returns {string}
 */
export function getHostnameLogicalId(hostname, suffix = '') {
  return getLogicalId(hostname.toLowerCase().replace(/\./g, 'Dot'), suffix)
}

/**
 * Logical IDs of the CloudFront distribution that serves a hostname and of
 * its stack outputs.
 *
 * @param {string} hostname
 */
export function getDistributionLogicalIds(hostname) {
  const id = (suffix) => getHostnameLogicalId(hostname, suffix)
  return {
    distribution: id('CloudFrontDistribution'),
    domainNameOutput: id('CloudFrontDistributionDomainName'),
    idOutput: id('CloudFrontDistributionId'),
  }
}

/**
 * The enabled `provider.domain(s)` entries with `webApp`, read the way the
 * domains plugin reads them at deploy, so the compiled template and the
 * deploy-time certificate and DNS steps agree. An invalid entry, or one
 * without a hostname, is an error, or with `warn` skipped with a warning (see
 * `WebAppDomainConfig.read` and `WebAppDomainConfig.withHostnames`).
 *
 * @param {object} providerConfig - `serverless.service.provider`
 * @param {object} [options]
 * @param {(message: string) => void} [options.warn]
 * @returns {WebAppDomainConfig[]}
 */
export function listWebAppDomains(providerConfig = {}, { warn } = {}) {
  return WebAppDomainConfig.withHostnames(
    listDomainEntries(providerConfig)
      .filter(({ config }) => config?.webApp != null)
      .flatMap(({ path, config }) =>
        WebAppDomainConfig.read(config, path, { warn }),
      )
      .filter((domain) => domain.enabled),
    { warn },
  )
}

/**
 * Entries grouped by (lower-cased) hostname, in the order hostnames first
 * appear.
 *
 * @param {WebAppDomainConfig[]} domainEntries
 * @returns {Map<string, WebAppDomainConfig[]>}
 */
function groupByHostname(domainEntries) {
  const byHostname = new Map()
  for (const domain of domainEntries) {
    if (!byHostname.has(domain.name)) byHostname.set(domain.name, [])
    byHostname.get(domain.name).push(domain)
  }
  return byHostname
}

/**
 * How long CloudFront waits for a web app's response to start and between
 * its bytes: the web app's timeout plus 5 seconds, so the web app's own
 * timeout response arrives first, capped at CloudFront's 120-second limit.
 */
function getOriginReadTimeout(webApp, providerConfig) {
  return Math.min(
    getEffectiveTimeout(webApp, providerConfig) + ORIGIN_READ_TIMEOUT_MARGIN,
    MAX_ORIGIN_READ_TIMEOUT,
  )
}

/** A cache behaviour that forwards everything to `originId`, uncached. */
function compileBehaviour(originId, pathPattern) {
  return {
    ...(pathPattern ? { PathPattern: pathPattern } : {}),
    TargetOriginId: originId,
    ViewerProtocolPolicy: 'redirect-to-https',
    AllowedMethods: ALL_METHODS,
    CachePolicyId: CACHING_DISABLED_POLICY_ID,
    OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  }
}

/**
 * `AWS::CloudFront::Distribution` for one hostname: one origin per web app on
 * it, the entry without `basePath` as the default behaviour, and two
 * behaviours per `basePath` (`/<basePath>` and `/<basePath>/*`, since `/api/*`
 * does not match `/api`), longest first so nested paths reach their own web
 * app. Paths reach the web app unchanged. The certificate comes from the
 * hostname's entry without `basePath`; without a literal `certificateArn` the
 * domains plugin writes it in at deploy.
 */
function compileDistribution({ hostname, entries, webApps, providerConfig }) {
  const root = WebAppDomainConfig.perHostname(entries)[0]
  const webAppKeys = [
    ...new Set([root, ...entries].map((domain) => domain.webApp)),
  ]
  const origins = webAppKeys.map((key) => {
    const logicalIds = getWebAppLogicalIds(key)
    return {
      Id: key,
      DomainName: { 'Fn::GetAtt': [logicalIds.endpoint, 'DomainName'] },
      OriginAccessControlId: {
        'Fn::GetAtt': [logicalIds.originAccessControl, 'Id'],
      },
      CustomOriginConfig: {
        OriginProtocolPolicy: 'https-only',
        OriginSSLProtocols: ['TLSv1.2'],
        OriginReadTimeout: getOriginReadTimeout(webApps[key], providerConfig),
      },
      OriginCustomHeaders: [
        { HeaderName: 'X-Forwarded-Host', HeaderValue: hostname },
      ],
    }
  })
  const cacheBehaviours = entries
    .filter((domain) => domain.basePath)
    .sort((a, b) => b.basePath.length - a.basePath.length)
    .flatMap(({ basePath, webApp }) => [
      compileBehaviour(webApp, `/${basePath}`),
      compileBehaviour(webApp, `/${basePath}/*`),
    ])

  const viewerCertificate = {
    ...(root.certificateArn ? { AcmCertificateArn: root.certificateArn } : {}),
    SslSupportMethod: 'sni-only',
    MinimumProtocolVersion: 'TLSv1.2_2021',
  }
  return {
    Type: 'AWS::CloudFront::Distribution',
    Properties: {
      DistributionConfig: {
        Enabled: true,
        Aliases: [hostname],
        IPV6Enabled: true,
        HttpVersion: 'http2',
        PriceClass: 'PriceClass_All',
        ViewerCertificate: viewerCertificate,
        Origins: origins,
        DefaultCacheBehavior: compileBehaviour(root.webApp),
        ...(cacheBehaviours.length > 0
          ? { CacheBehaviors: cacheBehaviours }
          : {}),
      },
    },
  }
}

/**
 * `AWS::CloudFront::OriginAccessControl` that signs CloudFront's requests to
 * the web app's endpoint. OAC names are unique per account, so the name adds
 * the Region to the function name.
 */
function compileOriginAccessControl({ functionName, region }) {
  return {
    Type: 'AWS::CloudFront::OriginAccessControl',
    Properties: {
      OriginAccessControlConfig: {
        Name: truncateWithHash(`${functionName}-${region}`, 64, '-'),
        OriginAccessControlOriginType: 'lambda',
        SigningBehavior: 'always-amz-auth',
        SigningProtocol: 'sigv4',
      },
    },
  }
}

/**
 * `AWS::Lambda::ResourcePolicy` letting CloudFront invoke the web app's
 * endpoint `main` for the distributions that serve it. Lambda keeps one
 * resource policy per function, so one statement lists every distribution.
 */
function compileResourcePolicy({ functionName, logicalIds, distributionIds }) {
  const functionArn = `arn:\${AWS::Partition}:lambda:\${AWS::Region}:\${AWS::AccountId}:web-function/${functionName}`
  return {
    Type: 'AWS::Lambda::ResourcePolicy',
    DependsOn: [logicalIds.webFunction],
    Properties: {
      ResourceArn: { 'Fn::Sub': functionArn },
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowCloudFront',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 'lambda:InvokeWebFunctionEndpoint',
            Resource: { 'Fn::Sub': `${functionArn}/endpoint/main` },
            Condition: {
              ArnLike: {
                'aws:SourceArn': distributionIds.map((id) => ({
                  'Fn::Sub': `arn:\${AWS::Partition}:cloudfront::\${AWS::AccountId}:distribution/\${${id}}`,
                })),
              },
            },
          },
        ],
      },
    },
  }
}

/**
 * One warning per web app and hostname where the web app can run longer than
 * CloudFront waits for its response (120 seconds, so a timeout above 115).
 *
 * @param {object} params
 * @param {WebAppDomainConfig[]} params.domainEntries - from `listWebAppDomains`
 * @param {Record<string, object>} params.webApps - `webApps`
 * @param {object} params.providerConfig - `serverless.service.provider`
 * @returns {string[]}
 */
export function getWebAppTimeoutWarnings({
  domainEntries,
  webApps,
  providerConfig,
}) {
  const warnings = []
  for (const [hostname, entries] of groupByHostname(domainEntries)) {
    for (const key of new Set(entries.map((domain) => domain.webApp))) {
      if (!webApps[key]) continue
      const timeout = getEffectiveTimeout(webApps[key], providerConfig)
      if (timeout + ORIGIN_READ_TIMEOUT_MARGIN > MAX_ORIGIN_READ_TIMEOUT) {
        warnings.push(
          `webApps.${key} can run for ${timeout} seconds, but through ${hostname} CloudFront waits at most ${MAX_ORIGIN_READ_TIMEOUT} seconds for a response to start and between response bytes. Longer requests work only on the web app's own endpoint.`,
        )
      }
    }
  }
  return warnings
}

/**
 * Serve web apps on their custom domains: per hostname a CloudFront
 * distribution and its two outputs, per web app behind a domain an Origin
 * Access Control and a resource policy. Logs the timeout warnings.
 *
 * @param {object} params
 * @param {WebAppDomainConfig[]} params.domainEntries - from `listWebAppDomains`
 * @param {Record<string, object>} params.webApps - `webApps`
 * @param {{ serviceName: string, stage: string, region: string }} params.ctx
 * @param {object} params.providerConfig - `serverless.service.provider`
 * @param {{ Resources: object, Outputs?: object }} params.template - mutated
 * @param {{ warning: Function }} params.log
 */
export function compileWebAppDomains({
  domainEntries,
  webApps,
  ctx,
  providerConfig,
  template,
  log,
}) {
  if (domainEntries.length === 0) return
  template.Outputs = template.Outputs || {}

  const distributionsByWebApp = new Map()
  for (const [hostname, entries] of groupByHostname(domainEntries)) {
    const ids = getDistributionLogicalIds(hostname)
    template.Resources[ids.distribution] = compileDistribution({
      hostname,
      entries,
      webApps,
      providerConfig,
    })
    template.Outputs[ids.domainNameOutput] = {
      Description: `CloudFront distribution domain name for ${hostname}`,
      Value: { 'Fn::GetAtt': [ids.distribution, 'DomainName'] },
    }
    template.Outputs[ids.idOutput] = {
      Description: `CloudFront distribution ID for ${hostname}`,
      Value: { Ref: ids.distribution },
    }
    for (const { webApp } of entries) {
      if (!distributionsByWebApp.has(webApp)) {
        distributionsByWebApp.set(webApp, new Set())
      }
      distributionsByWebApp.get(webApp).add(ids.distribution)
    }
  }

  for (const [key, distributionIds] of distributionsByWebApp) {
    const functionName = getWebAppFunctionName(ctx, key, webApps[key])
    const logicalIds = getWebAppLogicalIds(key)
    template.Resources[logicalIds.originAccessControl] =
      compileOriginAccessControl({ functionName, region: ctx.region })
    template.Resources[logicalIds.resourcePolicy] = compileResourcePolicy({
      functionName,
      logicalIds,
      distributionIds: [...distributionIds],
    })
  }

  for (const warning of getWebAppTimeoutWarnings({
    domainEntries,
    webApps,
    providerConfig,
  })) {
    log.warning(warning)
  }
}
