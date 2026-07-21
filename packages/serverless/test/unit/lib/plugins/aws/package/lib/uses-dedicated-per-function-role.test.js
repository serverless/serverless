import usesDedicatedPerFunctionRole, {
  hasExternalIamPerFunctionPlugin,
} from '../../../../../../../lib/plugins/aws/package/lib/uses-dedicated-per-function-role.js'

const makeServerless = ({ provider = {}, plugins = [] } = {}) => ({
  service: { provider },
  pluginManager: { getPlugins: () => plugins },
})
const awsProvider = {
  isExistingRoleProvided: (role) =>
    typeof role === 'string' ||
    (role != null &&
      typeof role === 'object' &&
      ('Fn::GetAtt' in role || 'Fn::ImportValue' in role || 'Ref' in role)),
}
const externalPlugin = {
  constructor: { name: 'ServerlessIamPerFunctionPlugin' },
}
const externalPluginByMarker = {
  constructor: {
    _serverlessExternalPluginName: 'serverless-iam-roles-per-function',
    name: 'SomeMinifiedName',
  },
}

describe('usesDedicatedPerFunctionRole', () => {
  it.each([
    ['statements (new shape)', { iam: { role: { statements: [] } } }],
    ['legacy iamRoleStatements', { iamRoleStatements: [] }],
    [
      'managedPolicies',
      { iam: { role: { managedPolicies: ['arn:aws:iam::aws:policy/X'] } } },
    ],
  ])('true for function with %s in shared mode', (_desc, fnConfig) => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: fnConfig,
        serverless: makeServerless(),
        awsProvider,
      }),
    ).toBe(true)
  })

  it('false for function without per-function config in shared mode', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: {},
        serverless: makeServerless(),
        awsProvider,
      }),
    ).toBe(false)
  })

  it('false for empty managedPolicies array', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: { iam: { role: { managedPolicies: [] } } },
        serverless: makeServerless(),
        awsProvider,
      }),
    ).toBe(false)
  })

  it('true for any function when mode is perFunction', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: {},
        serverless: makeServerless({
          provider: { iam: { role: { mode: 'perFunction' } } },
        }),
        awsProvider,
      }),
    ).toBe(true)
  })

  it('false when function sets role: (even with statements — package errors later)', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: {
          role: 'IamRoleLambdaExecution',
          iamRoleStatements: [],
        },
        serverless: makeServerless(),
        awsProvider,
      }),
    ).toBe(false)
  })

  it('false when provider.iam.role is an existing-role reference', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: { iamRoleStatements: [] },
        serverless: makeServerless({
          provider: { iam: { role: 'arn:aws:iam::123456789012:role/x' } },
        }),
        awsProvider,
      }),
    ).toBe(false)
  })

  it('false when provider.role is set (shared mode)', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: { iamRoleStatements: [] },
        serverless: makeServerless({ provider: { role: 'someLogicalId' } }),
        awsProvider,
      }),
    ).toBe(false)
  })

  it('false for everything when the external plugin is installed', () => {
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: { iamRoleStatements: [] },
        serverless: makeServerless({ plugins: [externalPlugin] }),
        awsProvider,
      }),
    ).toBe(false)
    expect(
      hasExternalIamPerFunctionPlugin(
        makeServerless({ plugins: [externalPlugin] }),
      ),
    ).toBe(true)
  })

  it('detects the external plugin via _serverlessExternalPluginName when constructor.name does not match', () => {
    const serverless = makeServerless({ plugins: [externalPluginByMarker] })

    expect(hasExternalIamPerFunctionPlugin(serverless)).toBe(true)
    expect(
      usesDedicatedPerFunctionRole({
        functionObject: { iamRoleStatements: [] },
        serverless,
        awsProvider,
      }),
    ).toBe(false)
  })
})
