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
})
