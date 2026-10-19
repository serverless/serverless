import { describe, expect, it } from '@jest/globals'
import { compileEndpoint } from '../../../../../../../lib/plugins/aws/web-apps/compilers/endpoint.js'
import { getWebAppLogicalIds } from '../../../../../../../lib/plugins/aws/web-apps/compilers/function.js'

const compile = (webApp = {}, { behindDomain } = {}) =>
  compileEndpoint({
    functionName: 'shop-dev-api',
    webApp: { entry: 'src/server.ts', ...webApp },
    logicalIds: getWebAppLogicalIds('api'),
    behindDomain,
  })

describe('compileEndpoint', () => {
  it('compiles a public HomeRegion endpoint named main', () => {
    expect(compile()).toEqual({
      Type: 'AWS::Lambda::WebFunctionEndpoint',
      DependsOn: [
        'ApiWebFunction',
        'ApiWebFunctionLogGroup',
        'ApiWebFunctionLocalLogGroup',
      ],
      Properties: {
        FunctionName: 'shop-dev-api',
        EndpointName: 'main',
        EndpointType: 'HomeRegion',
        AuthType: 'ApplicationManaged',
        RevisionWeights: [
          {
            RevisionId: {
              'Fn::GetAtt': ['ApiWebFunctionRevision', 'RevisionId'],
            },
            Weight: 100,
          },
        ],
      },
    })
  })

  it('treats url: true as public', () => {
    expect(compile({ url: true }).Properties.AuthType).toBe(
      'ApplicationManaged',
    )
  })

  it.each(['aws_iam', 'AWS_IAM'])('maps authorizer %s to IamAuth', (value) => {
    expect(compile({ url: { authorizer: value } }).Properties.AuthType).toBe(
      'IamAuth',
    )
  })

  it.each([undefined, true])(
    'uses IamAuth behind a custom domain (url %p)',
    (url) => {
      expect(compile({ url }, { behindDomain: true }).Properties.AuthType).toBe(
        'IamAuth',
      )
    },
  )

  it('sets the scaling and throttle limits', () => {
    const { Properties } = compile({
      url: { maxEnvironments: 4, rateLimit: 200 },
    })
    expect(Properties.ScalingConfig).toEqual({ MaxEnvironments: 4 })
    expect(Properties.ThrottleConfig).toEqual({ RateLimit: 200 })
  })

  // configValidationMode: off leaves them as written
  it('compiles limits given as numeric strings to numbers', () => {
    const { Properties } = compile({
      url: { maxEnvironments: '50', rateLimit: '2000' },
    })
    expect(Properties.ScalingConfig).toEqual({ MaxEnvironments: 50 })
    expect(Properties.ThrottleConfig).toEqual({ RateLimit: 2000 })
  })

  it('passes intrinsic limits through', () => {
    const { Properties } = compile({
      url: {
        maxEnvironments: { Ref: 'MaxEnvironments' },
        rateLimit: { 'Fn::If': ['IsProd', 1000, 100] },
      },
    })
    expect(Properties.ScalingConfig).toEqual({
      MaxEnvironments: { Ref: 'MaxEnvironments' },
    })
    expect(Properties.ThrottleConfig).toEqual({
      RateLimit: { 'Fn::If': ['IsProd', 1000, 100] },
    })
  })

  it('keeps a rateLimit of 0', () => {
    expect(
      compile({ url: { rateLimit: 0 } }).Properties.ThrottleConfig,
    ).toEqual({ RateLimit: 0 })
  })

  it('omits the limits when unset', () => {
    const { Properties } = compile({ url: {} })
    expect(Properties).not.toHaveProperty('ScalingConfig')
    expect(Properties).not.toHaveProperty('ThrottleConfig')
  })
})
