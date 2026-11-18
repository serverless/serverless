'use strict'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { ServerlessError } from '@serverless/util'
import rolesPerFunctionMixin from '../../../../../../../lib/plugins/aws/package/lib/roles-per-function.js'
import naming from '../../../../../../../lib/plugins/aws/lib/naming.js'
import { compileRevision } from '../../../../../../../lib/plugins/aws/web-apps/compilers/revision.js'
import { getWebAppLogicalIds } from '../../../../../../../lib/plugins/aws/web-apps/compilers/function.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iamRoleTemplatePath = path.resolve(
  __dirname,
  '../../../../../../../lib/plugins/aws/package/lib/iam-role-lambda-execution-template.json',
)

function buildContext({
  service = 'my-service',
  stage = 'dev',
  functions = {},
  webApps,
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
      webApps,
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
    },
    classes: { Error: ServerlessError },
    pluginManager: { getPlugins: () => plugins },
    config: {
      serverlessPath: path.resolve(__dirname, '../../../../../../../lib'),
    },
    utils: {
      readFileSync: () =>
        JSON.parse(fs.readFileSync(iamRoleTemplatePath, 'utf8')),
    },
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
    getCustomExecutionRole: (entry) =>
      entry.role ||
      (awsProvider.isExistingRoleProvided(provider.iam?.role)
        ? provider.iam.role
        : provider.role),
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

  // Seed each web app's revision as the web apps compiler emits it, pointing
  // at the role resolved for it (the generated one unless it sets `role`).
  for (const [key, webApp] of Object.entries(webApps || {})) {
    const logicalIds = getWebAppLogicalIds(key)
    compiledCloudFormationTemplate.Resources[logicalIds.revision] =
      compileRevision({
        functionName: `${service}-${stage}-${key}`,
        webApp,
        logicalIds,
        artifact: { key: `${key}.zip`, entrypoint: '__sls_web_bootstrap.mjs' },
        bucketRef: { Ref: 'ServerlessDeploymentBucket' },
        provider: awsProvider,
        providerConfig: provider,
      })
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

describe('createRolesPerFunction - web apps', () => {
  const arnLogPrefix =
    'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}'
  const webLogArns = (functionName, suffix) => [
    {
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/web/${functionName}${suffix}`,
    },
    {
      'Fn::Sub': `arn:\${AWS::Partition}:logs:*:\${AWS::AccountId}:log-group:/aws/lambda/web/${functionName}.local${suffix}`,
    },
  ]
  const providerStatement = {
    Effect: 'Allow',
    Action: ['s3:GetObject'],
    Resource: ['arn:aws:s3:::my-bucket/*'],
  }
  const perFunction = (role = {}) => ({
    iam: { role: { mode: 'perFunction', ...role } },
  })

  test('gives a web app its own role in perFunction mode and wires it into the revision', () => {
    const kmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/web'
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts', kmsKeyArn } },
      providerOverrides: {
        ...perFunction({ statements: [providerStatement] }),
        vpc: { securityGroupIds: ['sg-1'], subnetIds: ['subnet-1'] },
      },
    })
    delete resources.IamRoleLambdaExecution

    ctx.createRolesPerFunction()

    const role = resources.ApiWebFunctionIamRoleLambdaExecution
    expect(role.Type).toBe('AWS::IAM::Role')
    expect(role.Properties.RoleName).toEqual({
      'Fn::Join': [
        '-',
        ['my-service', 'dev', 'api', { Ref: 'AWS::Region' }, 'lambdaRole'],
      ],
    })
    expect(role.Properties.Policies[0].PolicyDocument.Statement).toEqual([
      {
        Effect: 'Allow',
        Action: [
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
          'logs:TagResource',
        ],
        Resource: webLogArns('my-service-dev-api', ':*'),
      },
      {
        Effect: 'Allow',
        Action: ['logs:PutLogEvents'],
        Resource: webLogArns('my-service-dev-api', ':*:*'),
      },
      { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: [kmsKeyArn] },
      providerStatement,
    ])
    // The network connector creates the network interfaces.
    expect(role.Properties.ManagedPolicyArns).toEqual([])

    const revision = resources.ApiWebFunctionRevision
    expect(revision.Properties.ServiceConfig.ExecutionRoleArn).toEqual({
      'Fn::GetAtt': ['ApiWebFunctionIamRoleLambdaExecution', 'Arn'],
    })
    expect(revision.DependsOn).toEqual([
      'ApiWebFunction',
      'ApiWebFunctionIamRoleLambdaExecution',
    ])
  })

  test('applies provider managed policies and permissions boundary to the web app role', () => {
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: perFunction({
        managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
        permissionsBoundary: 'arn:aws:iam::123456789012:policy/boundary',
      }),
    })

    ctx.createRolesPerFunction()

    const role = resources.ApiWebFunctionIamRoleLambdaExecution
    expect(role.Properties.ManagedPolicyArns).toEqual([
      'arn:aws:iam::aws:policy/ReadOnlyAccess',
    ])
    expect(role.Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::123456789012:policy/boundary',
    )
  })

  test('creates no role for a web app that sets role', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          role: 'arn:aws:iam::123456789012:role/web',
        },
      },
      providerOverrides: perFunction(),
    })

    ctx.createRolesPerFunction()

    expect(resources.ApiWebFunctionIamRoleLambdaExecution).toBeUndefined()
    expect(
      resources.ApiWebFunctionRevision.Properties.ServiceConfig
        .ExecutionRoleArn,
    ).toBe('arn:aws:iam::123456789012:role/web')
  })

  test('creates no web app role outside perFunction mode', () => {
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
    })

    ctx.createRolesPerFunction()

    expect(resources.ApiWebFunctionIamRoleLambdaExecution).toBeUndefined()
    expect(
      resources.ApiWebFunctionRevision.Properties.ServiceConfig
        .ExecutionRoleArn,
    ).toEqual({ 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] })
  })

  test('gives functions and web apps their own roles side by side', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: perFunction(),
    })

    ctx.createRolesPerFunction()

    expect(resources.HelloIamRoleLambdaExecution.Type).toBe('AWS::IAM::Role')
    expect(resources.HelloLambdaFunction.Properties.Role['Fn::GetAtt'][0]).toBe(
      'HelloIamRoleLambdaExecution',
    )
    expect(resources.ApiWebFunctionIamRoleLambdaExecution.Type).toBe(
      'AWS::IAM::Role',
    )
  })

  const webAppStatement = {
    Effect: 'Allow',
    Action: ['dynamodb:GetItem'],
    Resource: ['arn:aws:dynamodb:us-east-1:123456789012:table/Orders'],
  }

  test('gives a web app with iam.role.statements its own role in shared mode', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      webApps: {
        api: {
          entry: 'src/server.ts',
          iam: {
            role: {
              statements: [webAppStatement],
              managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
              permissionsBoundary: 'arn:aws:iam::123456789012:policy/boundary',
              path: '/web/',
              name: 'my-service-dev-api-role',
              tags: { team: 'web' },
            },
          },
        },
        admin: { entry: 'src/admin.ts' },
      },
      providerOverrides: { iam: { role: { statements: [providerStatement] } } },
    })

    ctx.createRolesPerFunction()

    const role = resources.ApiWebFunctionIamRoleLambdaExecution
    expect(role.Type).toBe('AWS::IAM::Role')
    expect(role.Properties.RoleName).toBe('my-service-dev-api-role')
    expect(role.Properties.Path).toBe('/web/')
    expect(role.Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::123456789012:policy/boundary',
    )
    expect(role.Properties.ManagedPolicyArns).toEqual([
      'arn:aws:iam::aws:policy/ReadOnlyAccess',
    ])
    expect(role.Properties.Tags).toEqual([{ Key: 'team', Value: 'web' }])
    // Shared mode: provider statements are not inherited unless asked for
    expect(role.Properties.Policies[0].PolicyDocument.Statement).toEqual([
      expect.objectContaining({
        Action: expect.arrayContaining(['logs:CreateLogStream']),
      }),
      expect.objectContaining({ Action: ['logs:PutLogEvents'] }),
      webAppStatement,
    ])
    expect(
      resources.ApiWebFunctionRevision.Properties.ServiceConfig
        .ExecutionRoleArn,
    ).toEqual({
      'Fn::GetAtt': ['ApiWebFunctionIamRoleLambdaExecution', 'Arn'],
    })
    // The other web app and the function keep the shared role
    expect(resources.AdminWebFunctionIamRoleLambdaExecution).toBeUndefined()
    expect(
      resources.AdminWebFunctionRevision.Properties.ServiceConfig
        .ExecutionRoleArn,
    ).toEqual({ 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] })
    expect(resources.HelloIamRoleLambdaExecution).toBeUndefined()
  })

  test('inherits provider statements in shared mode with iam.inheritStatements: true', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          iam: {
            inheritStatements: true,
            role: { statements: [webAppStatement] },
          },
        },
      },
      providerOverrides: { iam: { role: { statements: [providerStatement] } } },
    })

    ctx.createRolesPerFunction()

    expect(
      resources.ApiWebFunctionIamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.slice(
        2,
      ),
    ).toEqual([providerStatement, webAppStatement])
  })

  test('leaves provider statements out of a web app role in perFunction mode with iam.inheritStatements: false', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          iam: {
            inheritStatements: false,
            role: { statements: [webAppStatement] },
          },
        },
        admin: { entry: 'src/admin.ts' },
      },
      providerOverrides: perFunction({ statements: [providerStatement] }),
    })
    delete resources.IamRoleLambdaExecution

    ctx.createRolesPerFunction()

    const statementsOf = (key) =>
      resources[`${key}WebFunctionIamRoleLambdaExecution`].Properties
        .Policies[0].PolicyDocument.Statement
    expect(statementsOf('Api').slice(2)).toEqual([webAppStatement])
    expect(statementsOf('Admin').slice(2)).toEqual([providerStatement])
  })

  test('names the web app when role is combined with iam.role settings', () => {
    const { ctx } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          role: 'arn:aws:iam::123456789012:role/web',
          iam: { role: { statements: [webAppStatement] } },
        },
      },
    })

    expect(() => ctx.createRolesPerFunction()).toThrow(
      expect.objectContaining({
        code: 'WEB_APPS_ROLE_WITH_IAM_ROLE',
        stack: undefined,
        message:
          'webApps.api.role cannot be combined with webApps.api.iam.role.statements. Remove role to give the web app a role of its own, or remove that setting to use the role.',
      }),
    )
  })

  test('names both iam.role settings when role is combined with both', () => {
    const { ctx } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          role: 'arn:aws:iam::123456789012:role/web',
          iam: {
            role: {
              statements: [webAppStatement],
              managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
            },
          },
        },
      },
    })

    expect(() => ctx.createRolesPerFunction()).toThrow(
      new Error(
        'webApps.api.role cannot be combined with webApps.api.iam.role.statements and webApps.api.iam.role.managedPolicies. Remove role to give the web app a role of its own, or remove those settings to use the role.',
      ),
    )
  })

  test('names only iam.role.managedPolicies when that is the setting combined with role', () => {
    const { ctx } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          role: 'arn:aws:iam::123456789012:role/web',
          iam: {
            role: {
              managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
            },
          },
        },
      },
    })

    expect(() => ctx.createRolesPerFunction()).toThrow(
      new Error(
        'webApps.api.role cannot be combined with webApps.api.iam.role.managedPolicies. Remove role to give the web app a role of its own, or remove that setting to use the role.',
      ),
    )
  })

  test('names the web app key for statements that are not policy statements', () => {
    const { ctx } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          iam: { role: { statements: [{ Effect: 'Allow' }] } },
        },
      },
    })

    let thrown
    try {
      ctx.createRolesPerFunction()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      code: 'INVALID_IAM_ROLE_STATEMENTS',
      stack: undefined,
      message:
        'webApps.api.iam.role.statements should be an array of objects, where each object has Effect, Action / NotAction, Resource / NotResource fields. Specifically, statement 0 is missing the following properties: Action / NotAction, Resource / NotResource',
    })
  })

  // configValidationMode: warn lets these through the schema; an empty `-`
  // item in YAML is null
  test.each([
    ['null', null],
    ['a string', 's3:GetObject'],
    ['a list', [webAppStatement]],
  ])(
    'rejects a web app statement that is %s, without a stack trace',
    (_title, statement) => {
      const { ctx } = buildContext({
        webApps: {
          api: {
            entry: 'src/server.ts',
            iam: { role: { statements: [webAppStatement, statement] } },
          },
        },
      })

      expect(() => ctx.createRolesPerFunction()).toThrow(
        expect.objectContaining({
          code: 'INVALID_IAM_ROLE_STATEMENTS',
          stack: undefined,
          message:
            'webApps.api.iam.role.statements should be an array of objects, where each object has Effect, Action / NotAction, Resource / NotResource fields. Specifically, statement 1 is not an object',
        }),
      )
    },
  )

  test.each([
    ['iam.role.statements', { iam: { role: { statements: [null] } } }],
    ['iamRoleStatements', { iamRoleStatements: [null] }],
  ])(
    'rejects a function statement that is not an object in %s, without a stack trace',
    (key, iamConfig) => {
      const { ctx } = buildContext({
        functions: {
          hello: { name: 'my-service-dev-hello', handler: 'h.h', ...iamConfig },
        },
      })

      expect(() => ctx.createRolesPerFunction()).toThrow(
        expect.objectContaining({
          code: 'INVALID_IAM_ROLE_STATEMENTS',
          stack: undefined,
          message: `functions.hello.${key} should be an array of objects, where each object has Effect, Action / NotAction, Resource / NotResource fields. Specifically, statement 0 is not an object`,
        }),
      )
    },
  )

  test('throws when a web app predicted to receive a dedicated role does not receive one', () => {
    const { ctx } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: perFunction(),
    })
    ctx._createRoleForFunction = () => {}

    expect(() => ctx.createRolesPerFunction()).toThrow(
      /Web app "api" was predicted to receive a dedicated IAM role/,
    )
  })
})
