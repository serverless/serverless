'use strict'

// Composed-pipeline tests: mergeIamTemplates() -> event compilers
// (stream/sqs/schedule) -> createRolesPerFunction()/handlePerFunctionRolesFinalizeHook().
//
// Unlike the sibling roles-per-function.test.js / merge-iam-templates.test.js
// (which stub out `serverless`/`provider` by hand), these scenarios exercise
// real `Serverless` + `AwsProvider` instances plus the real event-compiler
// classes, mirroring stream.test.js / sqs.test.js / schedule.test.js. That
// means we need the same `@serverless/util` mock those files use (extended
// with `log.warning`, which `roles-per-function.js`'s
// `handlePerFunctionRolesFinalizeHook` calls directly).
import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn(), link: jest.fn((url) => url) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { log } = await import('@serverless/util')
const { default: AwsProvider } =
  await import('../../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../../lib/serverless.js')
const { default: mergeIamTemplatesMixin } =
  await import('../../../../../../../lib/plugins/aws/package/lib/merge-iam-templates.js')
const { default: rolesPerFunctionMixin } =
  await import('../../../../../../../lib/plugins/aws/package/lib/roles-per-function.js')
const { default: AwsCompileStreamEvents } =
  await import('../../../../../../../lib/plugins/aws/package/compile/events/stream.js')
const { default: AwsCompileSQSEvents } =
  await import('../../../../../../../lib/plugins/aws/package/compile/events/sqs.js')
const { default: AwsCompileScheduledEvents } =
  await import('../../../../../../../lib/plugins/aws/package/compile/events/schedule.js')

const STREAM_ARN = (n) =>
  `arn:aws:dynamodb:us-east-1:123456789012:table/t${n}/stream/2024-01-01T00:00:00.000`

// Builds a real Serverless + AwsProvider pair, wires up the given functions,
// and seeds each function's Lambda resource the way the real functions
// compiler would leave it (Role pointing at the not-yet-created global
// role) — the brief's allowed shortcut for skipping the full functions
// compiler.
function buildService({
  service = 'my-service',
  functions = {},
  providerOverrides = {},
  plugins,
} = {}) {
  const serverless = new Serverless({ commands: [], options: {} })
  serverless.cli = { log: jest.fn() }
  serverless.credentialProviders = {
    aws: { getCredentials: jest.fn() },
  }
  serverless.service.service = service
  serverless.service.provider.name = 'aws'
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }
  Object.assign(serverless.service.provider, providerOverrides)
  // AwsProvider's constructor sets `service.provider.region` from options
  // only when `service.provider.name === 'aws'` is already set — required
  // for roles-per-function.js's role-name-length math (region.length).
  serverless.setProvider(
    'aws',
    new AwsProvider(serverless, { region: 'us-east-1' }),
  )
  serverless.service.functions = functions

  if (plugins) {
    serverless.pluginManager.getPlugins = () => plugins
  }

  const provider = serverless.getProvider('aws')
  const resources =
    serverless.service.provider.compiledCloudFormationTemplate.Resources

  for (const functionName of Object.keys(functions)) {
    const logicalId = provider.naming.getLambdaLogicalId(functionName)
    resources[logicalId] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: functions[functionName].name || functionName,
        Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
      },
    }
  }

  const ctx = {
    serverless,
    provider,
    ...mergeIamTemplatesMixin,
    ...rolesPerFunctionMixin,
  }

  return { serverless, provider, ctx, resources }
}

// Runs the requested subset of real event compilers against the given
// Serverless instance, matching how `package:compileEvents` hooks run them
// in the actual pipeline (before createRolesPerFunction, which runs at
// finalize).
function runEventCompilers(serverless, { stream, sqs, schedule } = {}) {
  if (stream) new AwsCompileStreamEvents(serverless).compileStreamEvents()
  if (sqs) new AwsCompileSQSEvents(serverless).compileSQSEvents()
  if (schedule) {
    new AwsCompileScheduledEvents(serverless).compileScheduledEvents()
  }
}

function countOccurrences(value, needle) {
  return JSON.stringify(value).split(needle).length - 1
}

function makeStreamFunctions(dedicatedNames) {
  const functions = {}
  ;['fn1', 'fn2', 'fn3'].forEach((name, i) => {
    functions[name] = {
      handler: 'h.h',
      events: [{ stream: { arn: STREAM_ARN(i + 1), type: 'dynamodb' } }],
      ...(dedicatedNames.includes(name) ? { iamRoleStatements: [] } : {}),
    }
  })
  return functions
}

describe('per-function IAM: composed global-role pipeline', () => {
  // Scenario 1: a shared function and a dedicated function both reference
  // the SAME stream ARN. After the guard in stream.js, only the shared
  // function's statement contributes to the global role, so the ARN shows
  // up exactly once. This test was proven non-vacuous by temporarily
  // neutralizing that guard and confirming the assertion then fails with 2
  // occurrences.
  test('scenario 1: shared-resource retention — ARN shared by a shared and a dedicated function appears exactly once in the global policy', () => {
    const sharedArn = STREAM_ARN('shared')
    const { serverless, ctx, resources } = buildService({
      functions: {
        sharedFn: {
          handler: 'h.h',
          events: [{ stream: { arn: sharedArn, type: 'dynamodb' } }],
        },
        dedicatedFn: {
          handler: 'h.h',
          iamRoleStatements: [],
          events: [{ stream: { arn: sharedArn, type: 'dynamodb' } }],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true })
    ctx.createRolesPerFunction()

    const globalStatements =
      resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
        .Statement

    expect(countOccurrences(globalStatements, sharedArn)).toBe(1)
  })

  // Scenario 2: monotonicity. Same 3-function service, packaged twice: once
  // with one dedicated function, once with two. The global policy for the
  // "more dedicated functions" variant must never be larger.
  test('scenario 2: monotonicity — more dedicated functions never grows the global policy', () => {
    const variantA = buildService({ functions: makeStreamFunctions(['fn1']) })
    variantA.ctx.mergeIamTemplates()
    runEventCompilers(variantA.serverless, { stream: true })
    variantA.ctx.createRolesPerFunction()

    const variantB = buildService({
      functions: makeStreamFunctions(['fn1', 'fn2']),
    })
    variantB.ctx.mergeIamTemplates()
    runEventCompilers(variantB.serverless, { stream: true })
    variantB.ctx.createRolesPerFunction()

    const lengthOf = ({ resources }) =>
      JSON.stringify(
        resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument,
      ).length

    expect(lengthOf(variantB)).toBeLessThan(lengthOf(variantA))
  })

  // Scenario 3: byte-identity when no per-function IAM config is present at
  // all. None of the guards should have any observable effect on the global
  // role — pin its shape with a snapshot so any future guard regresses this.
  test('scenario 3: byte-identity — global role with no per-function IAM config matches recorded snapshot', () => {
    const { serverless, ctx, resources } = buildService({
      functions: {
        hello: {
          handler: 'h.h',
          events: [
            { stream: { arn: STREAM_ARN(1), type: 'dynamodb' } },
            { sqs: { arn: 'arn:aws:sqs:us-east-1:123456789012:my-queue' } },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true, sqs: true })
    ctx.createRolesPerFunction()

    expect(resources.IamRoleLambdaExecution).toMatchSnapshot()
  })

  // Scenario 4: the external `serverless-iam-roles-per-function` plugin is
  // loaded. `usesDedicatedPerFunctionRole` treats that as "no dedicated
  // roles at all" (guards inert, all ARNs retained), and the finalize hook
  // must skip `createRolesPerFunction()` entirely (logging a deprecation
  // warning) rather than create dedicated roles anyway. Calling
  // `createRolesPerFunction()` directly here would be wrong: it has no
  // knowledge of the external plugin and would create a dedicated role for
  // `dedicatedFn` since it still declares `iamRoleStatements`.
  test('scenario 4: external serverless-iam-roles-per-function plugin — guards inert, no dedicated roles created, deprecation warning logged', () => {
    const sharedArn = STREAM_ARN('shared')
    const { serverless, ctx, resources, provider } = buildService({
      functions: {
        sharedFn: {
          handler: 'h.h',
          events: [{ stream: { arn: sharedArn, type: 'dynamodb' } }],
        },
        dedicatedFn: {
          handler: 'h.h',
          iamRoleStatements: [],
          events: [{ stream: { arn: sharedArn, type: 'dynamodb' } }],
        },
      },
      plugins: [{ constructor: { name: 'ServerlessIamPerFunctionPlugin' } }],
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true })
    ctx.handlePerFunctionRolesFinalizeHook()

    const globalStatements =
      resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
        .Statement

    // Both functions' contributions are retained — the external plugin
    // disables the guard entirely, so the ARN shows up once per
    // contributing function.
    expect(countOccurrences(globalStatements, sharedArn)).toBe(2)

    const dedicatedRoleLogicalId =
      provider.naming.getNormalizedFunctionName('dedicatedFn') +
      provider.naming.getRoleLogicalId()
    expect(resources[dedicatedRoleLogicalId]).toBeUndefined()

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('serverless-iam-roles-per-function'),
    )
  })

  // Scenario 5: a dedicated function using EventBridge Scheduler. schedule.js
  // reads the function resource's `Role` object by reference at compile
  // time and stores that SAME object as `Target.RoleArn`. createRolesPerFunction
  // later mutates that object's `Fn::GetAtt[0]` in place when it hands the
  // function its dedicated role, so the schedule's RoleArn must alias the
  // final dedicated-role name without any extra wiring.
  test('scenario 5: scheduler RoleArn pin — Target.RoleArn aliases the dedicated role after createRolesPerFunction', () => {
    const { serverless, ctx, resources, provider } = buildService({
      functions: {
        schedFn: {
          name: 'my-service-dev-schedFn',
          handler: 'h.h',
          iamRoleStatements: [],
          events: [
            { schedule: { method: 'scheduler', rate: ['rate(1 hour)'] } },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { schedule: true })
    ctx.createRolesPerFunction()

    const scheduleLogicalId = provider.naming.getSchedulerScheduleLogicalId(
      'schedFn',
      1,
    )
    const dedicatedRoleLogicalId =
      provider.naming.getNormalizedFunctionName('schedFn') +
      provider.naming.getRoleLogicalId()

    expect(resources[dedicatedRoleLogicalId]).toBeDefined()
    expect(resources[scheduleLogicalId].Properties.Target.RoleArn).toEqual({
      'Fn::GetAtt': [dedicatedRoleLogicalId, 'Arn'],
    })
  })

  // Scenario 6: `provider.iam.role.mode: perFunction`. There is no global
  // role at all, so every guard must be inert (nothing to protect). Every
  // function gets its own dedicated role carrying its own stream grants.
  test('scenario 6: mode perFunction — no global role, per-function roles carry stream grants, full template matches snapshot', () => {
    const { serverless, ctx, resources } = buildService({
      providerOverrides: { iam: { role: { mode: 'perFunction' } } },
      functions: {
        one: {
          handler: 'h.h',
          events: [{ stream: { arn: STREAM_ARN(1), type: 'dynamodb' } }],
        },
        two: {
          handler: 'h.h',
          events: [{ stream: { arn: STREAM_ARN(2), type: 'dynamodb' } }],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true })
    ctx.createRolesPerFunction()

    expect(resources.IamRoleLambdaExecution).toBeUndefined()
    expect(resources).toMatchSnapshot()
  })
})
