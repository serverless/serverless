import { describe, expect, it } from '@jest/globals'
import {
  compileWebFunction,
  getWebAppFunctionName,
  getWebAppLogicalIds,
} from '../../../../../../../lib/plugins/aws/web-apps/compilers/function.js'
import { givenContext } from '../given.js'

describe('getWebAppFunctionName', () => {
  it('is <service>-<stage>-<key>', () => {
    expect(getWebAppFunctionName(givenContext(), 'api', {})).toBe(
      'shop-dev-api',
    )
  })

  it('uses the entry name when set', () => {
    expect(
      getWebAppFunctionName(givenContext(), 'api', { name: 'storefront' }),
    ).toBe('storefront')
  })

  it('truncates a long name to 64 characters with a hash tail', () => {
    const name = getWebAppFunctionName(
      givenContext({ serviceName: 'a-very-long-service-name-'.repeat(3) }),
      'api',
      {},
    )
    expect(name).toHaveLength(64)
    expect(name).toMatch(/^a-very-long-service-name-.*-[0-9a-f]{7}$/)
  })
})

describe('getWebAppLogicalIds', () => {
  it('names every resource and the output after the key', () => {
    expect(getWebAppLogicalIds('api')).toEqual({
      webFunction: 'ApiWebFunction',
      revision: 'ApiWebFunctionRevision',
      endpoint: 'ApiWebFunctionEndpoint',
      logGroup: 'ApiWebFunctionLogGroup',
      localLogGroup: 'ApiWebFunctionLocalLogGroup',
      networkConnector: 'ApiWebFunctionNetworkConnector',
      networkConnectorOperatorRole:
        'ApiWebFunctionNetworkConnectorOperatorRole',
      executionRole: 'ApiWebFunctionIamRoleLambdaExecution',
      originAccessControl: 'ApiWebFunctionOriginAccessControl',
      resourcePolicy: 'ApiWebFunctionResourcePolicy',
      urlOutput: 'ApiWebFunctionUrl',
    })
  })

  it('spells out - and _ in the key', () => {
    expect(getWebAppLogicalIds('my_app-1').webFunction).toBe(
      'MyUnderscoreappDash1WebFunction',
    )
  })
})

describe('compileWebFunction', () => {
  const logicalIds = getWebAppLogicalIds('api')

  it('compiles a minimal web function', () => {
    expect(
      compileWebFunction({
        functionName: 'shop-dev-api',
        webApp: { entry: 'src/server.ts' },
        logicalIds,
        providerConfig: {},
      }),
    ).toEqual({
      Type: 'AWS::Lambda::WebFunction',
      DependsOn: ['ApiWebFunctionLogGroup', 'ApiWebFunctionLocalLogGroup'],
      Properties: { FunctionName: 'shop-dev-api' },
    })
  })

  it('merges provider.tags under the entry tags', () => {
    expect(
      compileWebFunction({
        functionName: 'shop-dev-api',
        webApp: { entry: 'src/server.ts', tags: { env: 'prod' } },
        logicalIds,
        providerConfig: { tags: { team: 'web', env: 'dev' } },
      }).Properties.Tags,
    ).toEqual([
      { Key: 'team', Value: 'web' },
      { Key: 'env', Value: 'prod' },
    ])
  })

  it('passes intrinsic tag values through', () => {
    expect(
      compileWebFunction({
        functionName: 'shop-dev-api',
        webApp: { entry: 'src/server.ts', tags: { owner: { Ref: 'Owner' } } },
        logicalIds,
        providerConfig: {},
      }).Properties.Tags,
    ).toEqual([{ Key: 'owner', Value: { Ref: 'Owner' } }])
  })
})
