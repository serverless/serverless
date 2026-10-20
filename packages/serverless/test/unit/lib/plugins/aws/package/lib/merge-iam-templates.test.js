'use strict'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'

import mergeIamTemplatesMixin from '../../../../../../../lib/plugins/aws/package/lib/merge-iam-templates.js'
import naming from '../../../../../../../lib/plugins/aws/lib/naming.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverlessPath = path.resolve(__dirname, '../../../../../../../lib')
const iamRoleTemplatePath = path.resolve(
  __dirname,
  '../../../../../../../lib/plugins/aws/package/lib/iam-role-lambda-execution-template.json',
)

const arnLogPrefix =
  'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}'

function buildContext({
  service = 'my-service',
  stage = 'dev',
  functions = {},
  webApps,
  providerOverrides = {},
} = {}) {
  const compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }

  const provider = {
    name: 'aws',
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
    config: {
      serverlessPath,
    },
    utils: {
      readFileSync: jest.fn((filePath) => {
        if (filePath.endsWith('iam-role-lambda-execution-template.json')) {
          return JSON.parse(fs.readFileSync(iamRoleTemplatePath, 'utf8'))
        }
        throw new Error(`Unexpected readFileSync call for: ${filePath}`)
      }),
    },
  }

  const awsProvider = {
    serverless,
    getStage: () => stage,
    getLogRetentionInDays: () => serverless.service.provider.logRetentionInDays,
    getLogDataProtectionPolicy: () =>
      serverless.service.provider.logDataProtectionPolicy,
    getLogGroupClass: (fn) =>
      fn?.logs?.logGroupClass ??
      serverless.service.provider.logs?.lambda?.logGroupClass,
    isExistingRoleProvided: (role) =>
      typeof role === 'string' ||
      (role &&
        typeof role === 'object' &&
        Object.keys(role).some((k) => k.includes('::'))),
  }
  awsProvider.naming = { provider: awsProvider }
  Object.assign(awsProvider.naming, naming)

  return {
    ctx: {
      serverless,
      provider: awsProvider,
      ...mergeIamTemplatesMixin,
    },
    serverless,
    provider: awsProvider,
    resources: compiledCloudFormationTemplate.Resources,
  }
}

function runMerge(ctx) {
  return ctx.mergeIamTemplates()
}

describe('mergeIamTemplates - log group resources', () => {
  test('emits an AWS::Logs::LogGroup with default name and no extra properties for a plain function', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
      },
    })

    runMerge(ctx)

    const logGroup = resources.HelloLogGroup
    expect(logGroup).toBeDefined()
    expect(logGroup.Type).toBe('AWS::Logs::LogGroup')
    expect(logGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/my-service-dev-hello',
    )
    expect(logGroup.Properties).not.toHaveProperty('LogGroupClass')
    expect(logGroup.Properties).not.toHaveProperty('RetentionInDays')
    expect(logGroup.Properties).not.toHaveProperty('DataProtectionPolicy')
    expect(logGroup).not.toHaveProperty('DeletionPolicy')
  })

  test('does not emit a log group for a function with disableLogs: true', () => {
    const { ctx, resources } = buildContext({
      functions: {
        quiet: {
          name: 'my-service-dev-quiet',
          handler: 'h.h',
          disableLogs: true,
        },
      },
    })

    runMerge(ctx)

    expect(resources).not.toHaveProperty('QuietLogGroup')
  })

  test('propagates provider.logRetentionInDays to the log group as RetentionInDays', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      providerOverrides: { logRetentionInDays: 14 },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroup.Properties.RetentionInDays).toBe(14)
  })

  test('propagates provider.logDataProtectionPolicy to the log group as DataProtectionPolicy', () => {
    const policy = {
      Name: 'data-protection-policy',
      Version: '2021-06-01',
      Statement: [],
    }
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      providerOverrides: { logDataProtectionPolicy: policy },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroup.Properties.DataProtectionPolicy).toEqual(
      policy,
    )
  })

  test('function-level logRetentionInDays overrides the provider value', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logRetentionInDays: 30,
        },
      },
      providerOverrides: { logRetentionInDays: 14 },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroup.Properties.RetentionInDays).toBe(30)
  })

  test('function-level logDataProtectionPolicy overrides the provider value', () => {
    const providerPolicy = {
      Name: 'provider-policy',
      Version: '2021-06-01',
      Statement: [],
    }
    const functionPolicy = {
      Name: 'function-policy',
      Version: '2021-06-01',
      Statement: [],
    }
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logDataProtectionPolicy: functionPolicy,
        },
      },
      providerOverrides: { logDataProtectionPolicy: providerPolicy },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroup.Properties.DataProtectionPolicy).toEqual(
      functionPolicy,
    )
  })

  test('does not create a framework-managed log group when functions[].logs.logGroup is set', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logs: { logGroup: 'my-custom-log-group' },
        },
      },
    })

    runMerge(ctx)

    expect(resources).not.toHaveProperty('HelloLogGroup')
  })

  test('does not create a framework-managed log group when provider.logs.lambda.logGroup is set', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
      },
      providerOverrides: {
        logs: { lambda: { logGroup: 'service-wide-custom-group' } },
      },
    })

    runMerge(ctx)

    expect(resources).not.toHaveProperty('HelloLogGroup')
  })
})

describe('mergeIamTemplates - INFREQUENT_ACCESS log group', () => {
  test('emits an IA log group with LogGroupClass and DeletionPolicy: Retain when function uses IA', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logs: { logGroupClass: 'INFREQUENT_ACCESS' },
        },
      },
    })

    runMerge(ctx)

    const iaLogGroup = resources.HelloLogGroupIA
    expect(iaLogGroup).toBeDefined()
    expect(iaLogGroup.Type).toBe('AWS::Logs::LogGroup')
    expect(iaLogGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/my-service-dev-hello-ia',
    )
    expect(iaLogGroup.Properties.LogGroupClass).toBe('INFREQUENT_ACCESS')
    expect(iaLogGroup.DeletionPolicy).toBe('Retain')
  })

  test('also emits the standard log group alongside the IA one to preserve history', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logs: { logGroupClass: 'INFREQUENT_ACCESS' },
        },
      },
    })

    runMerge(ctx)

    const standardLogGroup = resources.HelloLogGroup
    expect(standardLogGroup).toBeDefined()
    expect(standardLogGroup.Properties.LogGroupName).toBe(
      '/aws/lambda/my-service-dev-hello',
    )
    expect(standardLogGroup.Properties).not.toHaveProperty('LogGroupClass')
    expect(standardLogGroup).not.toHaveProperty('DeletionPolicy')
  })

  test('propagates logRetentionInDays and logDataProtectionPolicy to the IA log group', () => {
    const policy = {
      Name: 'data-protection-policy',
      Version: '2021-06-01',
      Statement: [],
    }
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          logs: { logGroupClass: 'INFREQUENT_ACCESS' },
        },
      },
      providerOverrides: {
        logRetentionInDays: 7,
        logDataProtectionPolicy: policy,
      },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroupIA.Properties.RetentionInDays).toBe(7)
    expect(resources.HelloLogGroupIA.Properties.DataProtectionPolicy).toEqual(
      policy,
    )
  })

  test('applies provider-level logGroupClass to all functions that do not override it', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
        world: { name: 'my-service-dev-world', handler: 'h.h' },
      },
      providerOverrides: {
        logs: { lambda: { logGroupClass: 'INFREQUENT_ACCESS' } },
      },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroupIA).toBeDefined()
    expect(resources.WorldLogGroupIA).toBeDefined()
  })

  test('function-level STANDARD override prevents IA group provisioning for that function', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
        keepStandard: {
          name: 'my-service-dev-keepStandard',
          handler: 'h.h',
          logs: { logGroupClass: 'STANDARD' },
        },
      },
      providerOverrides: {
        logs: { lambda: { logGroupClass: 'INFREQUENT_ACCESS' } },
      },
    })

    runMerge(ctx)

    expect(resources.HelloLogGroupIA).toBeDefined()
    expect(resources).not.toHaveProperty('KeepStandardLogGroupIA')
    expect(resources.KeepStandardLogGroup).toBeDefined()
  })
})

describe('mergeIamTemplates - IAM role policy', () => {
  function getRoleStatements(resources) {
    return resources.IamRoleLambdaExecution.Properties.Policies[0]
      .PolicyDocument.Statement
  }

  test('grants logs:CreateLogStream/CreateLogGroup/TagResource on the canonical log group prefix', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Effect).toBe('Allow')
    expect(statements[0].Action).toEqual([
      'logs:CreateLogStream',
      'logs:CreateLogGroup',
      'logs:TagResource',
    ])
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*`,
    })
  })

  test('grants logs:PutLogEvents on the canonical log group prefix with stream suffix', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[1].Action).toEqual(['logs:PutLogEvents'])
    expect(statements[1].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*:*`,
    })
  })

  test('adds a dedicated Allow statement for a function with a custom resolved name', () => {
    const { ctx, resources } = buildContext({
      functions: {
        custom: { name: 'totally-custom-name', handler: 'h.h' },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*`,
    })
    expect(statements[1].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*:*`,
    })
  })

  test('adds a Deny statement on logs:PutLogEvents when a canonical function has disableLogs', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: { name: 'my-service-dev-hello', handler: 'h.h' },
        quiet: {
          name: 'my-service-dev-quiet',
          handler: 'h.h',
          disableLogs: true,
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    const denyStatement = statements.find((s) => s.Effect === 'Deny')
    expect(denyStatement).toBeDefined()
    expect(denyStatement.Action).toBe('logs:PutLogEvents')
    expect(denyStatement.Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev-quiet:*`,
    })
  })

  // Regression: a function that opts into Infrequent Access AND uses a
  // custom `name:` (i.e. one that doesn't start with the canonical
  // `<service>-<stage>` prefix) gets its real log group at
  // `/aws/lambda/<customName>-ia`. The IAM grant must reference the same
  // -ia group; otherwise `logs:PutLogEvents` is denied at runtime and
  // nothing reaches CloudWatch. Verified end-to-end against a live AWS
  // stack: before the fix the IA log group stayed empty; after the fix
  // log lines land as expected. See PR #13601 review thread.
  test('grants on the -ia log group when a custom-named function uses INFREQUENT_ACCESS', () => {
    const { ctx, resources } = buildContext({
      functions: {
        custom: {
          name: 'totally-custom-name',
          handler: 'h.h',
          logs: { logGroupClass: 'INFREQUENT_ACCESS' },
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    // CreateLogStream/CreateLogGroup/TagResource grant must reference -ia.
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name-ia:*`,
    })
    // PutLogEvents grant must reference -ia.
    expect(statements[1].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name-ia:*:*`,
    })
    // The pre-fix (broken) ARN form must NOT be present — otherwise a
    // refactor could silently leave the broken grant alongside the
    // correct one and tests would still pass.
    expect(statements[0].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*`,
    })
    expect(statements[1].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*:*`,
    })
  })

  // Inverse safety net: with no logGroupClass, the IAM grant for a
  // custom-named function stays on the bare (no `-ia`) prefix. This
  // proves the unwrap is *only* applied when the user opted into IA —
  // protecting every non-IA service from a behavior change.
  test('grants stay on the bare prefix for a custom-named function without logGroupClass (no-op for existing users)', () => {
    const { ctx, resources } = buildContext({
      functions: {
        custom: {
          name: 'totally-custom-name',
          handler: 'h.h',
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*`,
    })
    expect(statements[0].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name-ia:*`,
    })
  })

  // Provider-level IA propagates to a custom-named function the same way
  // function-level IA does — exercises the precedence path through
  // getLogGroupClass.
  test('uses provider-level logGroupClass when a custom-named function does not override it', () => {
    const { ctx, resources } = buildContext({
      functions: {
        custom: { name: 'totally-custom-name', handler: 'h.h' },
      },
      providerOverrides: {
        logs: { lambda: { logGroupClass: 'INFREQUENT_ACCESS' } },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[1].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name-ia:*:*`,
    })
  })

  // Function-level `logGroupClass: STANDARD` must override a provider-level
  // IA default — IAM grant goes back to the bare name even though the
  // service-wide default is IA. Asymmetry-safety check for getLogGroupClass.
  test('function-level STANDARD overrides provider-level IA for a custom-named function', () => {
    const { ctx, resources } = buildContext({
      functions: {
        custom: {
          name: 'totally-custom-name',
          handler: 'h.h',
          logs: { logGroupClass: 'STANDARD' },
        },
      },
      providerOverrides: {
        logs: { lambda: { logGroupClass: 'INFREQUENT_ACCESS' } },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name:*`,
    })
    expect(statements[0].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/totally-custom-name-ia:*`,
    })
  })

  test('omits custom log group ARNs of dedicated-role functions from the shared role', () => {
    const { ctx, resources } = buildContext({
      functions: {
        one: {
          name: 'custom-one',
          handler: 'h.h',
          iam: { role: { statements: [] } },
        },
        two: { name: 'custom-two', handler: 'h.h' },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/custom-two:*`,
    })
    expect(statements[0].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/custom-one:*`,
    })
    expect(statements[1].Resource).toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/custom-two:*:*`,
    })
    expect(statements[1].Resource).not.toContainEqual({
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/custom-one:*:*`,
    })
  })

  test('falls back to wildcard log resources when all custom-named functions are dedicated', () => {
    const { ctx, resources } = buildContext({
      functions: {
        one: {
          name: 'custom-one',
          handler: 'h.h',
          iam: { role: { statements: [] } },
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*`,
      },
    ])
    expect(statements[1].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*:*`,
      },
    ])
  })

  // Regression: the wildcard fallback (all custom-named/custom-log-group
  // functions are dedicated, so no per-function grants get added) must not
  // silently re-enable disableLogs for a canonically-named function. The
  // fallback's canonical wildcard Allow covers every canonical log group,
  // including the disabled one's — so the Deny must still be emitted.
  test('still emits a Deny for a disableLogs function when the wildcard fallback fires', () => {
    const { ctx, resources } = buildContext({
      functions: {
        dedicated: {
          name: 'custom-dedicated',
          handler: 'h.h',
          iam: { role: { statements: [] } },
          logs: { logGroup: '/custom/x' },
        },
        quiet: {
          name: 'my-service-dev-quiet',
          handler: 'h.h',
          disableLogs: true,
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    // Fallback fired: canonical wildcard pair present.
    expect(statements[0].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*`,
      },
    ])
    expect(statements[1].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*:*`,
      },
    ])
    // Deny must still be present for the disableLogs function.
    const denyStatement = statements.find((s) => s.Effect === 'Deny')
    expect(denyStatement).toBeDefined()
    expect(denyStatement.Action).toBe('logs:PutLogEvents')
    expect(denyStatement.Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev-quiet:*`,
      },
    ])
  })
})

describe('mergeIamTemplates - web apps', () => {
  const webLogArns = (functionName, suffix) => [
    {
      'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/web/${functionName}${suffix}`,
    },
    {
      'Fn::Sub': `arn:\${AWS::Partition}:logs:*:\${AWS::AccountId}:log-group:/aws/lambda/web/${functionName}.local${suffix}`,
    },
  ]
  const vpcAccessPolicy = {
    'Fn::Join': [
      '',
      [
        'arn:',
        { Ref: 'AWS::Partition' },
        ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
      ],
    ],
  }
  const vpc = { securityGroupIds: ['sg-1'], subnetIds: ['subnet-1'] }

  function getRoleStatements(resources) {
    return resources.IamRoleLambdaExecution.Properties.Policies[0]
      .PolicyDocument.Statement
  }

  test('creates the shared role for a service with web apps and no functions', () => {
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
    })

    runMerge(ctx)

    expect(resources.IamRoleLambdaExecution).toBeDefined()
    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*'),
    )
    expect(statements[1].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*:*'),
    )
  })

  test('grants the log groups of a web app with a custom name', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      webApps: { api: { entry: 'src/server.ts', name: 'storefront' } },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual([
      ...webLogArns('storefront', ':*'),
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*`,
      },
    ])
    expect(statements[1].Resource).toEqual([
      ...webLogArns('storefront', ':*:*'),
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*:*`,
      },
    ])
  })

  test('creates no role when every function and web app sets role', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          role: 'arn:aws:iam::123456789012:role/fn',
        },
      },
      webApps: {
        api: {
          entry: 'src/server.ts',
          role: 'arn:aws:iam::123456789012:role/web',
        },
      },
    })

    runMerge(ctx)

    expect(resources.IamRoleLambdaExecution).toBeUndefined()
  })

  test('creates the shared role when every function sets role but a web app does not', () => {
    const { ctx, resources } = buildContext({
      functions: {
        hello: {
          name: 'my-service-dev-hello',
          handler: 'h.h',
          role: 'arn:aws:iam::123456789012:role/fn',
        },
      },
      webApps: { api: { entry: 'src/server.ts' } },
    })

    runMerge(ctx)

    expect(resources.IamRoleLambdaExecution).toBeDefined()
  })

  test('adds nothing for a web app that sets role', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: { entry: 'src/server.ts' },
        admin: {
          entry: 'src/admin.ts',
          role: 'arn:aws:iam::123456789012:role/web',
          kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/admin',
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*'),
    )
    expect(statements[1].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*:*'),
    )
    expect(statements).toHaveLength(2)
  })

  test('adds nothing for a web app with a role of its own from iam.role', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: { entry: 'src/server.ts' },
        admin: {
          entry: 'src/admin.ts',
          kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/admin',
          iam: { role: { statements: [] } },
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*'),
    )
    expect(statements[1].Resource).toEqual(
      webLogArns('my-service-dev-api', ':*:*'),
    )
    expect(statements).toHaveLength(2)
  })

  test('keeps the shared role valid when the only web app has a role of its own from iam.role', () => {
    const { ctx, resources } = buildContext({
      webApps: {
        api: {
          entry: 'src/server.ts',
          iam: {
            role: {
              managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
            },
          },
        },
      },
    })

    runMerge(ctx)

    const statements = getRoleStatements(resources)
    expect(statements[0].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*`,
      },
    ])
    expect(statements[1].Resource).toEqual([
      {
        'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/my-service-dev*:*:*`,
      },
    ])
  })

  test('creates no shared role in perFunction mode', () => {
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: { iam: { role: { mode: 'perFunction' } } },
    })

    runMerge(ctx)

    expect(resources.IamRoleLambdaExecution).toBeUndefined()
  })

  test('does not attach AWSLambdaVPCAccessExecutionRole for provider.vpc when the service has only web apps', () => {
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: { vpc },
    })

    runMerge(ctx)

    expect(
      resources.IamRoleLambdaExecution.Properties.ManagedPolicyArns,
    ).toBeUndefined()
  })

  test('does not attach AWSLambdaVPCAccessExecutionRole for a web app vpc', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      webApps: { api: { entry: 'src/server.ts', vpc } },
    })

    runMerge(ctx)

    expect(
      resources.IamRoleLambdaExecution.Properties.ManagedPolicyArns,
    ).toBeUndefined()
  })

  test('still attaches AWSLambdaVPCAccessExecutionRole for provider.vpc when the service has a function', () => {
    const { ctx, resources } = buildContext({
      functions: { hello: { name: 'my-service-dev-hello', handler: 'h.h' } },
      webApps: { api: { entry: 'src/server.ts' } },
      providerOverrides: { vpc },
    })

    runMerge(ctx)

    expect(
      resources.IamRoleLambdaExecution.Properties.ManagedPolicyArns,
    ).toEqual([vpcAccessPolicy])
  })

  test('grants kms:Decrypt on the key a web app sets', () => {
    const kmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/web'
    const { ctx, resources } = buildContext({
      webApps: { api: { entry: 'src/server.ts', kmsKeyArn } },
    })

    runMerge(ctx)

    expect(getRoleStatements(resources)).toContainEqual({
      Effect: 'Allow',
      Action: ['kms:Decrypt'],
      Resource: [kmsKeyArn],
    })
  })

  test('grants kms:Decrypt once on provider.kmsKeyArn inherited by several web apps', () => {
    const kmsKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/provider'
    const { ctx, resources } = buildContext({
      webApps: {
        api: { entry: 'src/server.ts' },
        admin: { entry: 'src/admin.ts' },
      },
      providerOverrides: { kmsKeyArn },
    })

    runMerge(ctx)

    const kmsStatements = getRoleStatements(resources).filter((s) =>
      s.Action?.includes?.('kms:Decrypt'),
    )
    expect(kmsStatements).toEqual([
      { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: [kmsKeyArn] },
    ])
  })
})
