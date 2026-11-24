import {
  CUSTOMER_MANAGED_RUNTIME,
  getCustomerManagedRuntimeFailureContext,
  isCustomerManagedRuntime,
  parseRuntimeAliasArn,
  toRuntimeConfig,
} from '../../../../../../lib/plugins/aws/lib/customer-managed-runtime.js'

const { default: Service } =
  await import('../../../../../../lib/classes/service.js')

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

  it.each([
    ['an alias ARN', aliasArn],
    ['an intrinsic', { Ref: 'RuntimeStable' }],
  ])('says what to check for %s, without the value', (_, value) => {
    expect(
      getCustomerManagedRuntimeFailureContext(
        serverlessFor({ api: value }),
        notFound,
      ),
    ).toBe(
      'Function "api" uses a customer-managed runtime. Check that its runtime alias exists in this Region and that the deploying role has lambda:AssociateRuntimeAlias on it.',
    )
  })

  it('says what to check when a new function names a missing runtime alias', () => {
    expect(
      getCustomerManagedRuntimeFailureContext(
        serverlessFor({ api: aliasArn }),
        {
          ...notFound,
          ResourceStatusReason:
            'Resource handler returned message: "Runtime Alias not found (Service: Lambda, Status Code: 404, Request ID: x) (SDK Attempt Count: 1)" (RequestToken: x, HandlerErrorCode: NotFound)',
        },
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

  it('finds a provider-level value through a converted Service after compile', () => {
    const service = new Service({
      configurationFilename: 'serverless.yml',
      configurationInput: {
        service: 'svc',
        provider: { name: 'aws', runtime: aliasArn },
        functions: {
          api: { handler: 'index.handler' },
          toString: { handler: 'index.handler', runtime: 'nodejs24.x' },
        },
      },
      utils: { getVersion: () => '4.32.0' },
    })
    service.loadServiceFileParam()
    service.convertCustomerManagedRuntimes()
    // compile/functions.js writes the resolved runtime to each function
    for (const functionObject of Object.values(service.functions)) {
      functionObject.runtime ??= 'custom'
    }
    const serverless = {
      service,
      getProvider: () => ({
        naming: {
          getLambdaLogicalId: (name) =>
            `${name[0].toUpperCase()}${name.slice(1)}LambdaFunction`,
        },
      }),
    }

    expect(
      getCustomerManagedRuntimeFailureContext(serverless, notFound),
    ).toContain('Function "api" uses a customer-managed runtime.')
    expect(
      getCustomerManagedRuntimeFailureContext(serverless, {
        ...notFound,
        LogicalResourceId: 'ToStringLambdaFunction',
      }),
    ).toBeUndefined()
  })
})
