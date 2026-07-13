'use strict'

// Exhaustive lockstep property test.
//
// PROPERTY: usesDedicatedPerFunctionRole(...) (the compile-time predicate) must
// agree, for every representable config shape, with what the finalize hook
// (handlePerFunctionRolesFinalizeHook -> createRolesPerFunction) ACTUALLY does:
//
//   predicted === true  => after the hook, the function's dedicated role
//     resource exists AND the function resource's Role is wired to it
//     ({ 'Fn::GetAtt': ['<NormalizedFn>IamRoleLambdaExecution', 'Arn'] }),
//     OR the run threw (loud failure is acceptable, silence is not).
//   predicted === false => the built-in role creation did NOT create/wire a
//     dedicated role for that function.
//
// The template "before" state (whether the global IamRoleLambdaExecution role
// exists, whether log groups exist, etc.) is produced by the REAL
// mergeIamTemplates() code rather than hand-seeded, so the setup faithfully
// mirrors production for every provider/function combination.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import rolesPerFunctionMixin from '../../../../../../../lib/plugins/aws/package/lib/roles-per-function.js'
import mergeIamTemplatesMixin from '../../../../../../../lib/plugins/aws/package/lib/merge-iam-templates.js'
import usesDedicatedPerFunctionRole from '../../../../../../../lib/plugins/aws/package/lib/uses-dedicated-per-function-role.js'
import naming from '../../../../../../../lib/plugins/aws/lib/naming.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// packages/serverless/lib — matches serverless.config.serverlessPath in prod.
const serverlessPath = path.resolve(__dirname, '../../../../../../../lib')

// Minimal stand-in for the real Serverless framework error class, matching the
// shape `_throwError` depends on: `new this.serverless.classes.Error(msg)`.
class FakeServerlessError extends Error {}

// Real @serverless/util is not needed here: mergeIamTemplates only throws its
// ServerlessError on the provider.role + perFunction combo, which is not part
// of this matrix (no provider shape sets both). We still wrap the call in the
// same try/catch as the finalize hook so any such throw counts as "loud".

const PROBE = 'probe'

function buildContext({
  providerOverrides = {},
  functionObject = {},
  plugins = [],
}) {
  const compiledCloudFormationTemplate = { Resources: {}, Outputs: {} }

  const provider = {
    name: 'aws',
    region: 'us-east-1',
    compiledCloudFormationTemplate,
    ...providerOverrides,
  }

  const functions = {
    [PROBE]: {
      name: 'my-service-dev-probe',
      handler: 'handler.main',
      ...functionObject,
    },
  }

  const serverless = {
    service: {
      service: 'my-service',
      provider,
      functions,
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
    },
    classes: { Error: FakeServerlessError },
    config: { serverlessPath },
    // mergeIamTemplates + roles-per-function read the IAM role template through
    // this; the .json template is parsed exactly as the real readFileSync does.
    utils: { readFileSync: (p) => JSON.parse(fs.readFileSync(p, 'utf8')) },
    pluginManager: { getPlugins: () => plugins },
  }

  const awsProvider = {
    serverless,
    getStage: () => 'dev',
    getLogGroupClass: (fn) => fn?.logs?.logGroupClass,
    getLogRetentionInDays: () => undefined,
    getLogDataProtectionPolicy: () => undefined,
    isExistingRoleProvided: (role) =>
      typeof role === 'string' ||
      (role &&
        typeof role === 'object' &&
        Object.keys(role).some((k) => k.includes('::'))),
  }
  awsProvider.naming = { provider: awsProvider }
  Object.assign(awsProvider.naming, naming)

  const ctx = {
    serverless,
    provider: awsProvider,
    ...mergeIamTemplatesMixin,
    ...rolesPerFunctionMixin,
  }

  return {
    ctx,
    serverless,
    provider: awsProvider,
    resources: compiledCloudFormationTemplate.Resources,
  }
}

// --- Matrix dimensions --------------------------------------------------------

const PROVIDER_SHAPES = [
  { label: 'P1 {} (plain shared)', value: {} },
  {
    label: "P2 { role: 'someLogicalRoleId' }",
    value: { role: 'someLogicalRoleId' },
  },
  {
    label: "P3 { iam.role: 'arn:...existing' }",
    value: { iam: { role: 'arn:aws:iam::123456789012:role/existing' } },
  },
  {
    label: "P4 { iam.role: { 'Fn::GetAtt': [...] } }",
    value: { iam: { role: { 'Fn::GetAtt': ['SomeRole', 'Arn'] } } },
  },
  {
    label: "P5 { iam.role: { mode: 'perFunction' } }",
    value: { iam: { role: { mode: 'perFunction' } } },
  },
  {
    label: 'P6 { iam.role.statements: [...] } (provider statements, shared)',
    value: {
      iam: {
        role: {
          statements: [
            { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
          ],
        },
      },
    },
  },
  { label: 'P7 { iam: null }', value: { iam: null } },
]

const FUNCTION_SHAPES = [
  { label: 'A {} (no iam config)', value: {} },
  {
    label: "B { role: 'customRoleLogicalId' }",
    value: { role: 'customRoleLogicalId' },
  },
  {
    label: "C { role: 'IamRoleLambdaExecution' } (pinned shared)",
    value: { role: 'IamRoleLambdaExecution' },
  },
  {
    label: 'D { iamRoleStatements: [] } (legacy empty)',
    value: { iamRoleStatements: [] },
  },
  {
    label: 'E { iam.role.statements: [] }',
    value: { iam: { role: { statements: [] } } },
  },
  {
    label: 'F { iam.role.statements: null }',
    value: { iam: { role: { statements: null } } },
  },
  {
    label: 'G { iam.role.managedPolicies: [] } (empty => NOT custom)',
    value: { iam: { role: { managedPolicies: [] } } },
  },
  {
    label: 'H { iam.role.managedPolicies: [arn] }',
    value: {
      iam: {
        role: { managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'] },
      },
    },
  },
  { label: 'I { iam: null }', value: { iam: null } },
  {
    label: 'J { role + iamRoleStatements } (conflict => throws)',
    value: { role: 'customRoleLogicalId', iamRoleStatements: [] },
  },
]

const PLUGIN_SHAPES = [
  { label: 'plugin-absent', value: [] },
  {
    label: 'plugin-present',
    value: [{ constructor: { name: 'ServerlessIamPerFunctionPlugin' } }],
  },
]

// Cross product: 7 x 10 x 2 = 140 cells. No cell is skipped: the harness builds
// raw config objects directly (as the existing roles-per-function.test.js does)
// and does not run the config JSON schema, so every provider/function/plugin
// combination is representable at this unit level.
const CELLS = []
for (const p of PROVIDER_SHAPES) {
  for (const f of FUNCTION_SHAPES) {
    for (const plugin of PLUGIN_SHAPES) {
      CELLS.push({
        title: `${p.label} | ${f.label} | ${plugin.label}`,
        provider: p,
        fn: f,
        plugin,
      })
    }
  }
}

describe('usesDedicatedPerFunctionRole - exhaustive lockstep with dedicated role creation', () => {
  test('matrix covers exactly 140 cells (7 providers x 10 functions x 2 plugin states)', () => {
    expect(CELLS.length).toBe(140)
  })

  test.each(CELLS.map((c) => [c.title, c]))('%s', (_title, cell) => {
    const cellConfig = {
      provider: cell.provider.value,
      function: cell.fn.value,
      plugin: cell.plugin.label,
    }

    const { ctx, serverless, provider, resources } = buildContext({
      providerOverrides: cell.provider.value,
      functionObject: cell.fn.value,
      plugins: cell.plugin.value,
    })

    const functionObject = serverless.service.getFunction(PROBE)

    // 1. Compile-time prediction.
    const predicted = usesDedicatedPerFunctionRole({
      functionObject,
      serverless,
      awsProvider: provider,
    })

    // 2. Produce the real "before" template state, then run the finalize hook.
    //    Any throw from either step counts as a loud failure.
    let threw = false
    try {
      ctx.mergeIamTemplates()

      // Seed the Lambda function resource(s) the compile-functions step would
      // have produced (mergeIamTemplates never creates them). In shared mode
      // the function Role points at the global role; this is also the shape
      // _updateFunctionResourceRole requires when it rewires.
      const globalRoleName = provider.naming.getRoleLogicalId()
      for (const fnName of serverless.service.getAllFunctions()) {
        const lambdaLogicalId = provider.naming.getLambdaLogicalId(fnName)
        resources[lambdaLogicalId] = {
          Type: 'AWS::Lambda::Function',
          Properties: { Role: { 'Fn::GetAtt': [globalRoleName, 'Arn'] } },
        }
      }

      ctx.handlePerFunctionRolesFinalizeHook.call(ctx)
    } catch (err) {
      threw = true
    }

    // 3. Observe what actually happened.
    const dedicatedRoleName =
      provider.naming.getNormalizedFunctionName(PROBE) +
      provider.naming.getRoleLogicalId()
    const lambdaLogicalId = provider.naming.getLambdaLogicalId(PROBE)
    const lambdaResource = resources[lambdaLogicalId]
    const getAtt = lambdaResource?.Properties?.Role?.['Fn::GetAtt']
    const dedicatedRolePresent = Boolean(resources[dedicatedRoleName])
    const actual =
      dedicatedRolePresent &&
      Array.isArray(getAtt) &&
      getAtt[0] === dedicatedRoleName

    // 4. The lockstep assertion: loud failure OR prediction matches reality.
    if (!threw && predicted !== actual) {
      throw new Error(
        `LOCKSTEP MISMATCH between usesDedicatedPerFunctionRole and createRolesPerFunction\n` +
          `predicted=${predicted} actual=${actual} threw=${threw}\n` +
          `dedicatedRolePresent=${dedicatedRolePresent} lambdaRoleGetAtt=${JSON.stringify(
            getAtt,
          )}\n` +
          `cell config:\n${JSON.stringify(cellConfig, null, 2)}`,
      )
    }
    expect(threw || predicted === actual).toBe(true)

    // 5. When the predicate is TRUE and nothing threw, pin the wiring detail.
    if (predicted && !threw) {
      expect(dedicatedRolePresent).toBe(true)
      expect(resources[dedicatedRoleName].Type).toBe('AWS::IAM::Role')
      expect(getAtt[0]).toBe(dedicatedRoleName)
      const dependsOn = resources[lambdaLogicalId].DependsOn
      expect(Array.isArray(dependsOn)).toBe(true)
      expect(dependsOn).toContain(dedicatedRoleName)
    }
  })
})
