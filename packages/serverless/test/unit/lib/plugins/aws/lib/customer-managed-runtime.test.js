import {
  CUSTOMER_MANAGED_RUNTIME,
  getCustomerManagedRuntimeFailureContext,
  isCustomerManagedRuntime,
  parseRuntimeAliasArn,
  toRuntimeConfig,
} from '../../../../../../lib/plugins/aws/lib/customer-managed-runtime.js'

const aliasArn =
  'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

describe('customer-managed runtime helpers', () => {
  describe('isCustomerManagedRuntime', () => {
    it('accepts a runtime alias ARN', () => {
      expect(isCustomerManagedRuntime(aliasArn)).toBe(true)
      expect(
        isCustomerManagedRuntime(
          'arn:aws-cn:lambda:cn-north-1:123456789012:runtime/rt.v1-x/alias/My_Alias.1',
        ),
      ).toBe(true)
    })

    it('accepts a single-key CloudFormation intrinsic', () => {
      expect(isCustomerManagedRuntime({ Ref: 'RuntimeStable' })).toBe(true)
      expect(
        isCustomerManagedRuntime({ 'Fn::ImportValue': 'shared-runtime-alias' }),
      ).toBe(true)
      expect(
        isCustomerManagedRuntime({ 'Fn::GetAtt': ['RuntimeStable', 'Arn'] }),
      ).toBe(true)
    })

    it('rejects Lambda-managed identifiers and other values', () => {
      for (const value of [
        'nodejs24.x',
        'provided.al2023',
        'custom',
        undefined,
        null,
        '',
        {},
        { Ref: 'A', 'Fn::Sub': 'b' },
        { arn: aliasArn },
        [aliasArn],
        'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8',
        'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/version/v1',
        'arn:aws:lambda:us-east-1:123456789012:function:my-fn:prod',
      ]) {
        expect(isCustomerManagedRuntime(value)).toBe(false)
      }
    })
  })

  describe('parseRuntimeAliasArn', () => {
    it('splits an alias ARN into its parts', () => {
      expect(parseRuntimeAliasArn(aliasArn)).toEqual({
        runtimeArn: 'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8',
        alias: 'prod',
        partition: 'aws',
        region: 'us-east-1',
        accountId: '123456789012',
        runtimeName: 'companyphp8',
      })
    })

    it('returns null for anything else', () => {
      expect(parseRuntimeAliasArn({ Ref: 'RuntimeStable' })).toBeNull()
      expect(parseRuntimeAliasArn('nodejs24.x')).toBeNull()
      expect(
        parseRuntimeAliasArn(
          'arn:aws:lambda:us-east-1:123456789012:runtime/Upper/alias/prod',
        ),
      ).toBeNull()
    })
  })

  describe('toRuntimeConfig', () => {
    it('returns literal properties for an alias ARN', () => {
      expect(toRuntimeConfig(aliasArn)).toEqual({
        RuntimeArn: 'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8',
        RuntimeAlias: 'prod',
      })
    })

    it('splits an intrinsic with Fn::Split and Fn::Select', () => {
      const value = { Ref: 'RuntimeStable' }
      const split = { 'Fn::Split': ['/', value] }
      expect(toRuntimeConfig(value)).toEqual({
        RuntimeArn: {
          'Fn::Join': [
            '/',
            [{ 'Fn::Select': [0, split] }, { 'Fn::Select': [1, split] }],
          ],
        },
        RuntimeAlias: { 'Fn::Select': [3, split] },
      })
    })
  })

  it('exposes the Runtime value Lambda expects', () => {
    expect(CUSTOMER_MANAGED_RUNTIME).toBe('custom')
  })
})

describe('getCustomerManagedRuntimeFailureContext', () => {
  const serverlessFor = (stored) => ({
    service: {
      getAllFunctions: () => ['api', 'other'],
      getCustomerManagedRuntime: (name) => stored[name],
    },
    getProvider: () => ({
      naming: {
        getLambdaLogicalId: (name) =>
          `${name[0].toUpperCase()}${name.slice(1)}LambdaFunction`,
      },
    }),
  })
  const notFound = {
    ResourceType: 'AWS::Lambda::Function',
    LogicalResourceId: 'ApiLambdaFunction',
    ResourceStatusReason:
      'Resource handler returned message: "Lambda function svc-dev-api could not be found" (RequestToken: x, HandlerErrorCode: NotFound)',
  }

  it('names the alias ARN and what to check', () => {
    expect(
      getCustomerManagedRuntimeFailureContext(
        serverlessFor({ api: aliasArn }),
        notFound,
      ),
    ).toBe(
      `Function "api" uses the customer-managed runtime alias ${aliasArn}. Check that the alias exists in this Region and that the deploying role has lambda:AssociateRuntimeAlias on it.`,
    )
  })

  it('describes an intrinsic value without printing it', () => {
    expect(
      getCustomerManagedRuntimeFailureContext(
        serverlessFor({ api: { Ref: 'RuntimeStable' } }),
        notFound,
      ),
    ).toBe(
      'Function "api" uses a customer-managed runtime. Check that its runtime alias exists in this Region and that the deploying role has lambda:AssociateRuntimeAlias on it.',
    )
  })

  it('adds nothing for other failures or functions', () => {
    const serverless = serverlessFor({ api: aliasArn })
    expect(
      getCustomerManagedRuntimeFailureContext(serverless, {
        ...notFound,
        ResourceStatusReason: 'Rate exceeded',
      }),
    ).toBeUndefined()
    expect(
      getCustomerManagedRuntimeFailureContext(serverless, {
        ...notFound,
        LogicalResourceId: 'OtherLambdaFunction',
      }),
    ).toBeUndefined()
    expect(
      getCustomerManagedRuntimeFailureContext(serverless, {
        ...notFound,
        ResourceType: 'AWS::Lambda::Version',
      }),
    ).toBeUndefined()
  })
})
