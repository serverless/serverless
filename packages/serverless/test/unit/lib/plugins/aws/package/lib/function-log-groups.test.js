'use strict'

import buildFunctionLogGroupResources from '../../../../../../../lib/plugins/aws/package/lib/function-log-groups.js'

const fakeAwsProvider = ({
  retention,
  dataProtectionPolicy,
  effectiveClass,
} = {}) => ({
  naming: {
    getLogGroupLogicalId: (name, { logGroupClass } = {}) =>
      `${name[0].toUpperCase()}${name.slice(1)}${
        logGroupClass === 'INFREQUENT_ACCESS' ? 'IA' : ''
      }LogGroup`,
    getLogGroupName: (name, { logGroupClass } = {}) =>
      `/aws/lambda/${name}${logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''}`,
  },
  getLogRetentionInDays: () => retention,
  getLogDataProtectionPolicy: () => dataProtectionPolicy,
  getLogGroupClass: () => effectiveClass,
})

describe('buildFunctionLogGroupResources', () => {
  test('returns an empty map when disableLogs is true', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn', disableLogs: true },
      awsProvider: fakeAwsProvider(),
      serviceProvider: {},
    })
    expect(result).toEqual({})
  })

  test('returns an empty map when functions[].logs.logGroup is set', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: {
        name: 'svc-dev-fn',
        logs: { logGroup: 'my-custom-group' },
      },
      awsProvider: fakeAwsProvider(),
      serviceProvider: {},
    })
    expect(result).toEqual({})
  })

  test('returns an empty map when provider.logs.lambda.logGroup is set', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider(),
      serviceProvider: { logs: { lambda: { logGroup: 'service-wide' } } },
    })
    expect(result).toEqual({})
  })

  test('emits one standard log group when no class is configured', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider(),
      serviceProvider: {},
    })
    expect(result).toEqual({
      FnLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: { LogGroupName: '/aws/lambda/svc-dev-fn' },
      },
    })
  })

  test('propagates retention and data protection policy onto the standard group', () => {
    const policy = {
      Name: 'p',
      Version: '2021-06-01',
      Statement: [],
    }
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({
        retention: 14,
        dataProtectionPolicy: policy,
      }),
      serviceProvider: {},
    })
    expect(result.FnLogGroup.Properties.RetentionInDays).toBe(14)
    expect(result.FnLogGroup.Properties.DataProtectionPolicy).toEqual(policy)
  })

  test('function-level retention overrides the provider value', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: {
        name: 'svc-dev-fn',
        logRetentionInDays: 30,
      },
      awsProvider: fakeAwsProvider({ retention: 14 }),
      serviceProvider: {},
    })
    expect(result.FnLogGroup.Properties.RetentionInDays).toBe(30)
  })

  test('emits both standard and IA groups when effective class is INFREQUENT_ACCESS', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({ effectiveClass: 'INFREQUENT_ACCESS' }),
      serviceProvider: {},
    })
    expect(Object.keys(result).sort()).toEqual(['FnIALogGroup', 'FnLogGroup'])
  })

  test('IA group carries LogGroupClass and DeletionPolicy: Retain', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({ effectiveClass: 'INFREQUENT_ACCESS' }),
      serviceProvider: {},
    })
    expect(result.FnIALogGroup).toMatchObject({
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: '/aws/lambda/svc-dev-fn-ia',
        LogGroupClass: 'INFREQUENT_ACCESS',
      },
      DeletionPolicy: 'Retain',
    })
  })

  test('standard sibling never carries LogGroupClass or DeletionPolicy', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({ effectiveClass: 'INFREQUENT_ACCESS' }),
      serviceProvider: {},
    })
    expect(result.FnLogGroup.Properties).not.toHaveProperty('LogGroupClass')
    expect(result.FnLogGroup).not.toHaveProperty('DeletionPolicy')
  })

  test('retention and data protection policy apply to both standard and IA groups', () => {
    const policy = {
      Name: 'p',
      Version: '2021-06-01',
      Statement: [],
    }
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({
        retention: 7,
        dataProtectionPolicy: policy,
        effectiveClass: 'INFREQUENT_ACCESS',
      }),
      serviceProvider: {},
    })
    expect(result.FnLogGroup.Properties.RetentionInDays).toBe(7)
    expect(result.FnLogGroup.Properties.DataProtectionPolicy).toEqual(policy)
    expect(result.FnIALogGroup.Properties.RetentionInDays).toBe(7)
    expect(result.FnIALogGroup.Properties.DataProtectionPolicy).toEqual(policy)
  })

  test('STANDARD effective class produces only the standard group (no IA sibling)', () => {
    const result = buildFunctionLogGroupResources({
      functionName: 'fn',
      functionObject: { name: 'svc-dev-fn' },
      awsProvider: fakeAwsProvider({ effectiveClass: 'STANDARD' }),
      serviceProvider: {},
    })
    expect(Object.keys(result)).toEqual(['FnLogGroup'])
  })
})
