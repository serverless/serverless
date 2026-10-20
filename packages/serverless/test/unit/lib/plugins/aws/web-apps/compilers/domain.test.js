import { describe, expect, it, jest } from '@jest/globals'
import {
  compileWebAppDomains,
  getDistributionLogicalIds,
  getHostnameLogicalId,
  getWebAppTimeoutWarnings,
  listWebAppDomains,
} from '../../../../../../../lib/plugins/aws/web-apps/compilers/domain.js'

describe('getHostnameLogicalId', () => {
  it.each([
    ['shop.example.com', 'ShopDotexampleDotcom'],
    ['my-shop.example.com', 'MyDashshopDotexampleDotcom'],
    ['1.example.com', 'S1DotexampleDotcom'],
  ])('names %s %s', (hostname, logicalId) => {
    expect(getHostnameLogicalId(hostname)).toBe(logicalId)
  })

  it('keeps distinct hostnames apart', () => {
    expect(getHostnameLogicalId('ab.c.com')).not.toBe(
      getHostnameLogicalId('a.bc.com'),
    )
  })
})

describe('getDistributionLogicalIds', () => {
  it('names the distribution and its outputs after the hostname', () => {
    expect(getDistributionLogicalIds('shop.example.com')).toEqual({
      distribution: 'ShopDotexampleDotcomCloudFrontDistribution',
      domainNameOutput: 'ShopDotexampleDotcomCloudFrontDistributionDomainName',
      idOutput: 'ShopDotexampleDotcomCloudFrontDistributionId',
    })
  })

  it('keeps each suffix intact for the longest hostnames', () => {
    const hostname = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
    const ids = getDistributionLogicalIds(hostname)
    for (const [key, suffix] of [
      ['distribution', 'CloudFrontDistribution'],
      ['domainNameOutput', 'CloudFrontDistributionDomainName'],
      ['idOutput', 'CloudFrontDistributionId'],
    ]) {
      expect(ids[key].length).toBeLessThanOrEqual(255)
      expect(ids[key].endsWith(suffix)).toBe(true)
    }
  })
})

describe('getHostnameLogicalId case', () => {
  it('names a hostname the same in any case', () => {
    expect(getHostnameLogicalId('Shop.Example.COM')).toBe(
      'ShopDotexampleDotcom',
    )
  })
})

const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
const ALL_VIEWER_EXCEPT_HOST = 'b689b0a8-53d0-40ab-baf2-68738e2966ac'
const ALL_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']
const CERT_ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/abc'

const behaviour = (target, pathPattern) => ({
  ...(pathPattern ? { PathPattern: pathPattern } : {}),
  TargetOriginId: target,
  ViewerProtocolPolicy: 'redirect-to-https',
  AllowedMethods: ALL_METHODS,
  CachePolicyId: CACHING_DISABLED,
  OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST,
})

const compileDomains = ({
  domains,
  webApps = { web: { entry: 'web.js' }, api: { entry: 'api.js' } },
  providerConfig = {},
}) => {
  const template = { Resources: {}, Outputs: {} }
  const log = { warning: jest.fn() }
  compileWebAppDomains({
    domainEntries: listWebAppDomains({ ...providerConfig, domains }),
    webApps,
    ctx: { serviceName: 'shop', stage: 'dev', region: 'us-east-1' },
    providerConfig,
    template,
    log,
  })
  return { template, log }
}

describe('compileWebAppDomains', () => {
  it('compiles one hostname for one web app in the probed shape', () => {
    const { template, log } = compileDomains({
      domains: [{ name: 'shop.example.com', webApp: 'web' }],
    })

    expect(template.Resources).toEqual({
      WebWebFunctionOriginAccessControl: {
        Type: 'AWS::CloudFront::OriginAccessControl',
        Properties: {
          OriginAccessControlConfig: {
            Name: 'shop-dev-web-us-east-1',
            OriginAccessControlOriginType: 'lambda',
            SigningBehavior: 'always-amz-auth',
            SigningProtocol: 'sigv4',
          },
        },
      },
      ShopDotexampleDotcomCloudFrontDistribution: {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Aliases: ['shop.example.com'],
            IPV6Enabled: true,
            HttpVersion: 'http2',
            PriceClass: 'PriceClass_All',
            ViewerCertificate: {
              SslSupportMethod: 'sni-only',
              MinimumProtocolVersion: 'TLSv1.2_2021',
            },
            Origins: [
              {
                Id: 'web',
                DomainName: {
                  'Fn::GetAtt': ['WebWebFunctionEndpoint', 'DomainName'],
                },
                OriginAccessControlId: {
                  'Fn::GetAtt': ['WebWebFunctionOriginAccessControl', 'Id'],
                },
                CustomOriginConfig: {
                  OriginProtocolPolicy: 'https-only',
                  OriginSSLProtocols: ['TLSv1.2'],
                  OriginReadTimeout: 35,
                },
                OriginCustomHeaders: [
                  {
                    HeaderName: 'X-Forwarded-Host',
                    HeaderValue: 'shop.example.com',
                  },
                ],
              },
            ],
            DefaultCacheBehavior: behaviour('web'),
          },
        },
      },
      WebWebFunctionResourcePolicy: {
        Type: 'AWS::Lambda::ResourcePolicy',
        DependsOn: ['WebWebFunction'],
        Properties: {
          ResourceArn: {
            'Fn::Sub':
              'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:web-function/shop-dev-web',
          },
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'AllowCloudFront',
                Effect: 'Allow',
                Principal: { Service: 'cloudfront.amazonaws.com' },
                Action: 'lambda:InvokeWebFunctionEndpoint',
                Resource: {
                  'Fn::Sub':
                    'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:web-function/shop-dev-web/endpoint/main',
                },
                Condition: {
                  ArnLike: {
                    'aws:SourceArn': [
                      {
                        'Fn::Sub':
                          'arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${ShopDotexampleDotcomCloudFrontDistribution}',
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    })
    expect(template.Outputs).toEqual({
      ShopDotexampleDotcomCloudFrontDistributionDomainName: {
        Description: 'CloudFront distribution domain name for shop.example.com',
        Value: {
          'Fn::GetAtt': [
            'ShopDotexampleDotcomCloudFrontDistribution',
            'DomainName',
          ],
        },
      },
      ShopDotexampleDotcomCloudFrontDistributionId: {
        Description: 'CloudFront distribution ID for shop.example.com',
        Value: { Ref: 'ShopDotexampleDotcomCloudFrontDistribution' },
      },
    })
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('routes each basePath to its web app and the rest to the default', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'shop.example.com', webApp: 'api', basePath: '/api/' },
        { name: 'shop.example.com', webApp: 'web' },
      ],
    })
    const config =
      template.Resources.ShopDotexampleDotcomCloudFrontDistribution.Properties
        .DistributionConfig
    expect(config.Origins.map(({ Id }) => Id)).toEqual(['web', 'api'])
    expect(config.DefaultCacheBehavior).toEqual(behaviour('web'))
    expect(config.CacheBehaviors).toEqual([
      behaviour('api', '/api'),
      behaviour('api', '/api/*'),
    ])
    expect(Object.keys(template.Resources)).toEqual(
      expect.arrayContaining([
        'WebWebFunctionOriginAccessControl',
        'ApiWebFunctionOriginAccessControl',
        'WebWebFunctionResourcePolicy',
        'ApiWebFunctionResourcePolicy',
      ]),
    )
  })

  it('puts longer basePaths first so nested paths reach their web app', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'shop.example.com', webApp: 'web' },
        { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        { name: 'shop.example.com', webApp: 'v2', basePath: 'api/v2' },
      ],
      webApps: {
        web: { entry: 'w.js' },
        api: { entry: 'a.js' },
        v2: { entry: 'v.js' },
      },
    })
    expect(
      template.Resources.ShopDotexampleDotcomCloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.map(
        ({ PathPattern }) => PathPattern,
      ),
    ).toEqual(['/api/v2', '/api/v2/*', '/api', '/api/*'])
  })

  it('gives a web app one origin when it serves several basePaths', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'shop.example.com', webApp: 'web' },
        { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        { name: 'shop.example.com', webApp: 'api', basePath: 'hooks' },
      ],
    })
    expect(
      template.Resources.ShopDotexampleDotcomCloudFrontDistribution.Properties.DistributionConfig.Origins.map(
        ({ Id }) => Id,
      ),
    ).toEqual(['web', 'api'])
  })

  it.each([
    [{}, {}, 35],
    [{ timeout: 60 }, {}, 65],
    [{ timeout: 115 }, {}, 120],
    [{ timeout: 300 }, {}, 120],
    [{}, { timeout: 10 }, 15],
  ])(
    'sets OriginReadTimeout for web app %p and provider %p to %i',
    (webApp, providerConfig, expected) => {
      const { template } = compileDomains({
        domains: [{ name: 'shop.example.com', webApp: 'web' }],
        webApps: { web: { entry: 'w.js', ...webApp } },
        providerConfig,
      })
      expect(
        template.Resources.ShopDotexampleDotcomCloudFrontDistribution.Properties
          .DistributionConfig.Origins[0].CustomOriginConfig.OriginReadTimeout,
      ).toBe(expected)
    },
  )

  it('warns when a web app behind a domain can run longer than 115 seconds', () => {
    const { log } = compileDomains({
      domains: [{ name: 'shop.example.com', webApp: 'web' }],
      webApps: { web: { entry: 'w.js', timeout: 300 } },
    })
    expect(log.warning.mock.calls).toEqual([
      [
        "webApps.web can run for 300 seconds, but through shop.example.com CloudFront waits at most 120 seconds for a response to start and between response bytes. Longer requests work only on the web app's own endpoint.",
      ],
    ])
  })

  it('compiles a literal certificateArn from the entry without basePath', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        { name: 'shop.example.com', webApp: 'web', certificateArn: CERT_ARN },
      ],
    })
    expect(
      template.Resources.ShopDotexampleDotcomCloudFrontDistribution.Properties
        .DistributionConfig.ViewerCertificate,
    ).toEqual({
      AcmCertificateArn: CERT_ARN,
      SslSupportMethod: 'sni-only',
      MinimumProtocolVersion: 'TLSv1.2_2021',
    })
  })

  it('allows every distribution that serves a web app in its resource policy', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'shop.example.com', webApp: 'web' },
        { name: 'WWW.example.com', webApp: 'web' },
        { name: 'api.example.com', webApp: 'api' },
      ],
    })
    const sourceArns = (id) =>
      template.Resources[id].Properties.PolicyDocument.Statement[0].Condition
        .ArnLike['aws:SourceArn']
    expect(sourceArns('WebWebFunctionResourcePolicy')).toEqual(
      [
        'ShopDotexampleDotcomCloudFrontDistribution',
        'WwwDotexampleDotcomCloudFrontDistribution',
      ].map((id) => ({
        'Fn::Sub': `arn:\${AWS::Partition}:cloudfront::\${AWS::AccountId}:distribution/\${${id}}`,
      })),
    )
    expect(sourceArns('ApiWebFunctionResourcePolicy')).toEqual([
      {
        'Fn::Sub':
          'arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${ApiDotexampleDotcomCloudFrontDistribution}',
      },
    ])
    expect(
      template.Resources.WwwDotexampleDotcomCloudFrontDistribution.Properties
        .DistributionConfig.Aliases,
    ).toEqual(['www.example.com'])
  })

  it('groups entries whose hostnames differ only in case', () => {
    const { template } = compileDomains({
      domains: [
        { name: 'Shop.Example.com', webApp: 'web' },
        { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
      ],
    })
    expect(
      Object.keys(template.Resources).filter((id) =>
        id.endsWith('CloudFrontDistribution'),
      ),
    ).toEqual(['ShopDotexampleDotcomCloudFrontDistribution'])
  })

  it('names the OAC after the function name the entry sets', () => {
    const { template } = compileDomains({
      domains: [{ name: 'shop.example.com', webApp: 'web' }],
      webApps: { web: { entry: 'w.js', name: 'custom-web' } },
    })
    expect(
      template.Resources.WebWebFunctionOriginAccessControl.Properties
        .OriginAccessControlConfig.Name,
    ).toBe('custom-web-us-east-1')
  })

  it('skips disabled entries', () => {
    const { template } = compileDomains({
      domains: [{ name: 'shop.example.com', webApp: 'web', enabled: false }],
    })
    expect(template.Resources).toEqual({})
    expect(template.Outputs).toEqual({})
  })
})

describe('getWebAppTimeoutWarnings', () => {
  it('warns once per web app and hostname above 115 seconds', () => {
    expect(
      getWebAppTimeoutWarnings({
        domainEntries: listWebAppDomains({
          domains: [
            { name: 'shop.example.com', webApp: 'web' },
            { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
            { name: 'shop.example.com', webApp: 'api', basePath: 'v2' },
            { name: 'www.example.com', webApp: 'api' },
          ],
        }),
        webApps: {
          web: { entry: 'w.js', timeout: 115 },
          api: { entry: 'a.js' },
        },
        providerConfig: { timeout: 116 },
      }),
    ).toEqual([
      expect.stringMatching(
        /^webApps\.api can run for 116 seconds, but through shop\.example\.com /,
      ),
      expect.stringMatching(
        /^webApps\.api can run for 116 seconds, but through www\.example\.com /,
      ),
    ])
  })
})
