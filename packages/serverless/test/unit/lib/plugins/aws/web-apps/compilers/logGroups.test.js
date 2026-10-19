import { describe, expect, it } from '@jest/globals'
import {
  compileLogGroups,
  getWebAppLogGroupNames,
} from '../../../../../../../lib/plugins/aws/web-apps/compilers/logGroups.js'
import { givenProvider } from '../given.js'

describe('getWebAppLogGroupNames', () => {
  it('names the central and the local log group', () => {
    expect(getWebAppLogGroupNames('shop-dev-api')).toEqual({
      logGroupName: '/aws/lambda/web/shop-dev-api',
      localLogGroupName: '/aws/lambda/web/shop-dev-api.local',
    })
  })
})

describe('compileLogGroups', () => {
  const compile = (webApp = {}, providerConfig = {}) =>
    compileLogGroups({
      functionName: 'shop-dev-api',
      webApp: { entry: 'src/server.ts', ...webApp },
      provider: givenProvider(providerConfig),
    })

  it('compiles both log groups without retention by default', () => {
    expect(compile()).toEqual({
      logGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: { LogGroupName: '/aws/lambda/web/shop-dev-api' },
      },
      localLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: { LogGroupName: '/aws/lambda/web/shop-dev-api.local' },
      },
    })
  })

  it('inherits provider.logRetentionInDays', () => {
    const { logGroup, localLogGroup } = compile({}, { logRetentionInDays: 14 })
    expect(logGroup.Properties.RetentionInDays).toBe(14)
    expect(localLogGroup.Properties.RetentionInDays).toBe(14)
  })

  const POLICY = {
    Name: 'mask-emails',
    Version: '2021-06-01',
    Statement: [{ Sid: 'audit' }],
  }

  it('puts provider.logDataProtectionPolicy on both log groups', () => {
    const { logGroup, localLogGroup } = compile(
      {},
      { logDataProtectionPolicy: POLICY },
    )
    expect(logGroup.Properties.DataProtectionPolicy).toEqual(POLICY)
    expect(localLogGroup.Properties.DataProtectionPolicy).toEqual(POLICY)
  })

  it("prefers the web app's logDataProtectionPolicy", () => {
    const own = { ...POLICY, Name: 'own' }
    const { logGroup, localLogGroup } = compile(
      { logDataProtectionPolicy: own },
      { logDataProtectionPolicy: POLICY },
    )
    expect(logGroup.Properties.DataProtectionPolicy).toEqual(own)
    expect(localLogGroup.Properties.DataProtectionPolicy).toEqual(own)
  })

  it('prefers the entry logRetentionInDays', () => {
    const { logGroup, localLogGroup } = compile(
      { logRetentionInDays: 7 },
      { logRetentionInDays: 14 },
    )
    expect(logGroup.Properties.RetentionInDays).toBe(7)
    expect(localLogGroup.Properties.RetentionInDays).toBe(7)
  })
})
