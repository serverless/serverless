import { describe, expect, it, jest } from '@jest/globals'
import { compileWebApps } from '../../../../../../../lib/plugins/aws/web-apps/compilation/orchestrator.js'
import { givenContext, givenProvider } from '../given.js'

const artifactsFor = (...names) =>
  new Map(
    names.map((name) => [
      name,
      {
        key: `serverless/shop/dev/webapps/${name}-abc.zip`,
        sourceFile: `/svc/.serverless/webapps/${name}.zip`,
        entrypoint: '__sls_web_bootstrap.mjs',
        prebuilt: false,
      },
    ]),
  )

/** A template as the Framework compiles it for one function, `hello`. */
const givenFunctionTemplate = () => ({
  Resources: {
    ServerlessDeploymentBucket: { Type: 'AWS::S3::Bucket' },
    IamRoleLambdaExecution: { Type: 'AWS::IAM::Role', Properties: {} },
    HelloLogGroup: {
      Type: 'AWS::Logs::LogGroup',
      Properties: { LogGroupName: '/aws/lambda/shop-dev-hello' },
    },
    HelloLambdaFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: { FunctionName: 'shop-dev-hello', Handler: 'h.main' },
    },
  },
  Outputs: {
    ServerlessDeploymentBucketName: {
      Value: { Ref: 'ServerlessDeploymentBucket' },
    },
  },
})

const compile = ({
  webApps,
  template,
  deploymentBucket,
  providerConfig = {},
  log = { warning: jest.fn() },
} = {}) => {
  const provider = givenProvider(providerConfig, {
    package: deploymentBucket ? { deploymentBucket } : {},
  })
  compileWebApps({
    webApps,
    ctx: givenContext(),
    template,
    artifacts: artifactsFor(...Object.keys(webApps)),
    provider,
    serverless: provider.serverless,
    log,
  })
  return template
}

describe('compileWebApps', () => {
  it('adds five resources and one output per web app and leaves functions alone', () => {
    const before = givenFunctionTemplate()
    const template = compile({
      webApps: {
        api: { entry: 'src/api.ts' },
        'my_site-2': { entry: 'src/site.ts' },
      },
      template: givenFunctionTemplate(),
    })

    for (const [id, resource] of Object.entries(before.Resources)) {
      expect(template.Resources[id]).toEqual(resource)
    }
    expect(
      Object.keys(template.Resources).filter((id) => !(id in before.Resources)),
    ).toEqual([
      'ApiWebFunction',
      'ApiWebFunctionRevision',
      'ApiWebFunctionEndpoint',
      'ApiWebFunctionLogGroup',
      'ApiWebFunctionLocalLogGroup',
      'MyUnderscoresiteDash2WebFunction',
      'MyUnderscoresiteDash2WebFunctionRevision',
      'MyUnderscoresiteDash2WebFunctionEndpoint',
      'MyUnderscoresiteDash2WebFunctionLogGroup',
      'MyUnderscoresiteDash2WebFunctionLocalLogGroup',
    ])
    expect(template.Outputs).toEqual({
      ...before.Outputs,
      ApiWebFunctionUrl: expect.any(Object),
      MyUnderscoresiteDash2WebFunctionUrl: expect.any(Object),
    })
  })

  it('wires each resource to the web function by name', () => {
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      template: givenFunctionTemplate(),
    })

    expect(Resources.ApiWebFunction.Properties.FunctionName).toBe(
      'shop-dev-api',
    )
    expect(Resources.ApiWebFunctionRevision.Properties.FunctionName).toBe(
      'shop-dev-api',
    )
    expect(Resources.ApiWebFunctionEndpoint.Properties.FunctionName).toBe(
      'shop-dev-api',
    )
    expect(Resources.ApiWebFunctionLogGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/web/shop-dev-api',
    )
    expect(Resources.ApiWebFunctionLocalLogGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/web/shop-dev-api.local',
    )
  })

  // On stack deletion the function and its environments go first, so no log
  // line arrives after its log groups are deleted (Lambda would recreate a
  // group without retention).
  it('deletes each web function before its log groups, without a dependency cycle', () => {
    const { Resources } = compile({
      webApps: {
        web: { entry: 'web.js', vpc: { subnetIds: ['subnet-1'] } },
        api: { entry: 'api.js' },
      },
      template: givenFunctionTemplate(),
      providerConfig: {
        domains: [
          { name: 'shop.example.com', webApp: 'web' },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
        vpc: { subnetIds: ['subnet-2'] },
      },
    })

    expect(Resources.ApiWebFunction.DependsOn).toEqual([
      'ApiWebFunctionLogGroup',
      'ApiWebFunctionLocalLogGroup',
    ])
    expect(Resources.WebWebFunction.DependsOn).toEqual([
      'WebWebFunctionLogGroup',
      'WebWebFunctionLocalLogGroup',
    ])

    // Every edge CloudFormation orders by: DependsOn, Ref and Fn::GetAtt.
    const references = (value) => {
      if (Array.isArray(value)) return value.flatMap(references)
      if (!value || typeof value !== 'object') return []
      if (typeof value.Ref === 'string') return [value.Ref]
      if (Array.isArray(value['Fn::GetAtt'])) return [value['Fn::GetAtt'][0]]
      return Object.values(value).flatMap(references)
    }
    const edges = (id) =>
      [
        ...(Resources[id].DependsOn ?? []),
        ...references(Resources[id].Properties),
      ].filter((target) => target in Resources)
    const visiting = new Set()
    const done = new Set()
    const visit = (id, path) => {
      if (done.has(id)) return
      if (visiting.has(id)) {
        throw new Error(`dependency cycle: ${[...path, id].join(' -> ')}`)
      }
      visiting.add(id)
      for (const target of edges(id)) visit(target, [...path, id])
      visiting.delete(id)
      done.add(id)
    }
    expect(() => {
      for (const id of Object.keys(Resources)) visit(id, [])
    }).not.toThrow()
  })

  it('uses the entry name for every resource', () => {
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts', name: 'storefront' } },
      template: givenFunctionTemplate(),
    })

    expect(Resources.ApiWebFunction.Properties.FunctionName).toBe('storefront')
    expect(Resources.ApiWebFunctionEndpoint.Properties.FunctionName).toBe(
      'storefront',
    )
    expect(Resources.ApiWebFunctionLogGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/web/storefront',
    )
  })

  it('reads code from the in-stack bucket when no bucket name is known', () => {
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      template: givenFunctionTemplate(),
    })

    expect(
      Resources.ApiWebFunctionRevision.Properties.BuildConfig.CodeConfig,
    ).toEqual({
      S3Object: {
        Bucket: { Ref: 'ServerlessDeploymentBucket' },
        Key: 'serverless/shop/dev/webapps/api-abc.zip',
      },
    })
  })

  it('makes each revision wait for the in-stack bucket policy', () => {
    const template = givenFunctionTemplate()
    template.Resources.ServerlessDeploymentBucketPolicy = {
      Type: 'AWS::S3::BucketPolicy',
    }
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' }, site: { entry: 'src/site.ts' } },
      template,
    })

    expect(Resources.ApiWebFunctionRevision.DependsOn).toEqual([
      'ApiWebFunction',
      'ServerlessDeploymentBucketPolicy',
    ])
    expect(Resources.SiteWebFunctionRevision.DependsOn).toEqual([
      'SiteWebFunction',
      'ServerlessDeploymentBucketPolicy',
    ])
  })

  it('adds no bucket policy dependency for a resolved deployment bucket', () => {
    const template = givenFunctionTemplate()
    template.Resources.ServerlessDeploymentBucketPolicy = {
      Type: 'AWS::S3::BucketPolicy',
    }
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      template,
      deploymentBucket: 'serverless-framework-deployments-us-east-1-abc',
    })

    expect(Resources.ApiWebFunctionRevision.DependsOn).toEqual([
      'ApiWebFunction',
    ])
  })

  it('adds no bucket policy dependency when the stack has no bucket policy', () => {
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      template: givenFunctionTemplate(),
    })

    expect(Resources.ApiWebFunctionRevision.DependsOn).toEqual([
      'ApiWebFunction',
    ])
  })

  it('reads code from the resolved deployment bucket', () => {
    const { Resources } = compile({
      webApps: { api: { entry: 'src/api.ts' } },
      template: givenFunctionTemplate(),
      deploymentBucket: 'serverless-framework-deployments-us-east-1-abc',
    })

    expect(
      Resources.ApiWebFunctionRevision.Properties.BuildConfig.CodeConfig
        .S3Object.Bucket,
    ).toBe('serverless-framework-deployments-us-east-1-abc')
  })

  describe('custom domains', () => {
    const domains = [
      { name: 'shop.example.com', webApp: 'web' },
      { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
    ]

    it('fronts the targeted web apps with CloudFront and makes their endpoints IamAuth', () => {
      const log = { warning: jest.fn() }
      const { Resources, Outputs } = compile({
        webApps: {
          web: { entry: 'web.js' },
          api: { entry: 'api.js', timeout: 300 },
          other: { entry: 'other.js' },
        },
        template: givenFunctionTemplate(),
        providerConfig: { domains },
        log,
      })

      expect(Resources.WebWebFunctionEndpoint.Properties.AuthType).toBe(
        'IamAuth',
      )
      expect(Resources.ApiWebFunctionEndpoint.Properties.AuthType).toBe(
        'IamAuth',
      )
      expect(Resources.OtherWebFunctionEndpoint.Properties.AuthType).toBe(
        'ApplicationManaged',
      )
      expect(Resources.ShopDotexampleDotcomCloudFrontDistribution.Type).toBe(
        'AWS::CloudFront::Distribution',
      )
      expect(Resources.OtherWebFunctionOriginAccessControl).toBeUndefined()
      expect(Object.keys(Outputs)).toEqual(
        expect.arrayContaining([
          'ShopDotexampleDotcomCloudFrontDistributionDomainName',
          'ShopDotexampleDotcomCloudFrontDistributionId',
        ]),
      )
      expect(log.warning).toHaveBeenCalledTimes(1)
      expect(log.warning.mock.calls[0][0]).toMatch(
        /^webApps\.api can run for 300 seconds, but through shop\.example\.com /,
      )
    })

    it('reads provider.domain as well', () => {
      const { Resources } = compile({
        webApps: { web: { entry: 'web.js' } },
        template: givenFunctionTemplate(),
        providerConfig: {
          domain: { name: 'shop.example.com', webApp: 'web' },
        },
      })
      expect(Resources.WebWebFunctionEndpoint.Properties.AuthType).toBe(
        'IamAuth',
      )
      expect(Resources.ShopDotexampleDotcomCloudFrontDistribution).toBeDefined()
    })
  })
})
