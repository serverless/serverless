'use strict'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import rolesPerFunctionMixin from '../../../../../../../lib/plugins/aws/package/lib/roles-per-function.js'
import naming from '../../../../../../../lib/plugins/aws/lib/naming.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iamRoleTemplatePath = path.resolve(
  __dirname,
  '../../../../../../../lib/plugins/aws/package/lib/iam-role-lambda-execution-template.json',
)

// Minimal stand-in for the real Serverless framework error class, matching
// the shape `_throwError` depends on: `new this.serverless.classes.Error(msg)`.
class FakeServerlessError extends Error {}

function buildContext({
  service = 'my-service',
  stage = 'dev',
  functions = {},
  providerOverrides = {},
  plugins = [],
} = {}) {
  const compiledCloudFormationTemplate = { Resources: {}, Outputs: {} }

  const provider = {
    name: 'aws',
    region: 'us-east-1',
    compiledCloudFormationTemplate,
    ...providerOverrides,
  }

  const serverless = {
    service: {
      service,
      provider,
      functions,
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
    },
    classes: { Error: FakeServerlessError },
    pluginManager: { getPlugins: () => plugins },
  }

  const awsProvider = {
    serverless,
    getStage: () => stage,
    getLogGroupClass: (fn) => fn?.logs?.logGroupClass,
    isExistingRoleProvided: (role) =>
      typeof role === 'string' ||
      (role &&
        typeof role === 'object' &&
        Object.keys(role).some((k) => k.includes('::'))),
  }
  awsProvider.naming = { provider: awsProvider }
  Object.assign(awsProvider.naming, naming)

  // Seed the global IAM role resource (normally produced by
  // mergeIamTemplates before createRolesPerFunction runs) and a Lambda
  // function resource for every configured function, so _createRoleForFunction
  // has real CloudFormation resources to read/patch.
  const globalRoleName = awsProvider.naming.getRoleLogicalId()
  const globalIamRole = JSON.parse(fs.readFileSync(iamRoleTemplatePath, 'utf8'))
  globalIamRole.Properties.Path = awsProvider.naming.getRolePath()
  globalIamRole.Properties.RoleName = awsProvider.naming.getRoleName()
  globalIamRole.Properties.Policies[0].PolicyName =
    awsProvider.naming.getPolicyName()
  compiledCloudFormationTemplate.Resources[globalRoleName] = globalIamRole

  for (const functionName of Object.keys(functions)) {
    const lambdaLogicalId = awsProvider.naming.getLambdaLogicalId(functionName)
    compiledCloudFormationTemplate.Resources[lambdaLogicalId] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Role: { 'Fn::GetAtt': [globalRoleName, 'Arn'] },
      },
    }
  }

  return {
    ctx: {
      serverless,
      provider: awsProvider,
      ...rolesPerFunctionMixin,
    },
    serverless,
    provider: awsProvider,
    resources: compiledCloudFormationTemplate.Resources,
  }
}

describe('createRolesPerFunction - divergence guard', () => {
  test('throws when a function predicted to receive a dedicated role does not receive one', () => {
    const { ctx } = buildContext({
      functions: {
        myFn: {
          name: 'my-service-dev-myFn',
          handler: 'h.h',
          iamRoleStatements: [],
        },
      },
    })

    // Force the packaging step to skip actual role creation, simulating a
    // bug where the predicate (usesDedicatedPerFunctionRole) and the real
    // role-creation logic in _createRoleForFunction fall out of lockstep.
    ctx._createRoleForFunction = () => {}

    expect(() => ctx.createRolesPerFunction()).toThrow(
      /did not receive its dedicated IAM role/,
    )
  })

  test('does not throw and creates the dedicated role when prediction and creation agree (happy path)', () => {
    const { ctx, provider, resources } = buildContext({
      functions: {
        myFn: {
          name: 'my-service-dev-myFn',
          handler: 'h.h',
          iamRoleStatements: [],
        },
      },
    })

    expect(() => ctx.createRolesPerFunction()).not.toThrow()

    const globalRoleName = provider.naming.getRoleLogicalId()
    const dedicatedRoleName =
      provider.naming.getNormalizedFunctionName('myFn') + globalRoleName

    expect(resources[dedicatedRoleName]).toBeDefined()
    expect(resources[dedicatedRoleName].Type).toBe('AWS::IAM::Role')

    const lambdaLogicalId = provider.naming.getLambdaLogicalId('myFn')
    expect(resources[lambdaLogicalId].Properties.Role['Fn::GetAtt'][0]).toBe(
      dedicatedRoleName,
    )
  })

  test('throws when a dedicated role is created for a function that was not predicted to receive one', () => {
    // No function here is predicted to receive a dedicated role (plain
    // function, no per-function IAM config). We simulate a bug where a role
    // gets created anyway by hooking _setEventSourceMappings - it runs
    // immediately before the divergence guard and receives the same
    // functionToRoleMap the guard inspects, so injecting a bogus entry there
    // stands in for a real "created but not predicted" role.
    const { ctx } = buildContext({
      functions: {
        myFn: {
          name: 'my-service-dev-myFn',
          handler: 'h.h',
        },
      },
    })

    const original = ctx._setEventSourceMappings.bind(ctx)
    ctx._setEventSourceMappings = (functionToRoleMap) => {
      functionToRoleMap.set(
        'BogusFnLambdaFunction',
        'BogusFnIamRoleLambdaExecution',
      )
      return original(functionToRoleMap)
    }

    expect(() => ctx.createRolesPerFunction()).toThrow(
      /was not predicted to receive one/,
    )
  })
})
