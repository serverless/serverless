'use strict'

// Class-invariant regression suite for generated IAM roles.
//
// Guards against the bug class where the IAM pipeline emits a structurally
// invalid empty collection on a generated `AWS::IAM::Role` — most notably an
// empty `Resource: []` on a policy statement, which CloudFormation/IAM rejects
// at deploy time with "Policy statement must contain resources".
//
// Rather than pin one config, this packages a MATRIX of interacting service
// shapes through the REAL IAM pipeline (mergeIamTemplates -> event compilers ->
// createRolesPerFunction / handlePerFunctionRolesFinalizeHook) and asserts, for
// EVERY generated role (the shared `IamRoleLambdaExecution` AND every
// per-function `<Fn>IamRoleLambdaExecution`), that no empty collection is
// emitted. The assertion is generic: it walks all roles / policies / statements
// by shape, never by index, so new role shapes are covered automatically and a
// failure prints the offending role name, statement index and full JSON.
//
// Harness is intentionally identical to the sibling
// per-function-iam-global-role.test.js (real Serverless + AwsProvider + real
// event compilers, same `@serverless/util` mock — extended with `log.warning`,
// which handlePerFunctionRolesFinalizeHook calls).
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

const DYNAMODB_STREAM_ARN = (n) =>
  `arn:aws:dynamodb:us-east-1:123456789012:table/t${n}/stream/2024-01-01T00:00:00.000`
const KINESIS_STREAM_ARN = (n) =>
  `arn:aws:kinesis:us-east-1:123456789012:stream/k${n}`
const SQS_ARN = (n) => `arn:aws:sqs:us-east-1:123456789012:q${n}`
const SNS_ARN = (n) => `arn:aws:sns:us-east-1:123456789012:topic${n}`

// Builds a real Serverless + AwsProvider pair, wires up the given functions,
// and seeds each function's Lambda resource the way the real functions
// compiler would (Role pointing at the not-yet-created global role) — the
// allowed shortcut for skipping the full functions compiler. Mirrors
// per-function-iam-global-role.test.js exactly.
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

// Runs the requested subset of real event compilers, matching how
// package:compileEvents runs them before finalize.
function runEventCompilers(serverless, { stream, sqs, schedule } = {}) {
  if (stream) new AwsCompileStreamEvents(serverless).compileStreamEvents()
  if (sqs) new AwsCompileSQSEvents(serverless).compileSQSEvents()
  if (schedule) {
    new AwsCompileScheduledEvents(serverless).compileScheduledEvents()
  }
}

// Walks every generated AWS::IAM::Role in the template and asserts no
// structurally-invalid empty collection is present on any inline policy
// statement. Generic over roles / policies / statements — never indexes into a
// specific role or statement, so any newly generated role shape is covered.
//
// On failure, throws with the offending role name, statement index and the
// full statement JSON so a regression is instantly diagnosable.
//
// NOTE (deliberate exclusion): `ManagedPolicyArns: []` is NOT asserted on.
// An empty ManagedPolicyArns array is CFN-valid and is intentionally emitted on
// dedicated per-function roles. Do not "tighten" this helper to flag it.
function assertNoEmptyCollections(resources) {
  const roleEntries = Object.entries(resources).filter(
    ([, resource]) => resource && resource.Type === 'AWS::IAM::Role',
  )

  for (const [roleName, role] of roleEntries) {
    const policies = role.Properties && role.Properties.Policies
    // A role may legitimately carry only ManagedPolicyArns and no inline
    // Policies — nothing to assert on the (absent) statements in that case.
    if (policies === undefined) continue

    if (!Array.isArray(policies)) {
      throw new Error(
        `Role "${roleName}" has a non-array Policies property: ${JSON.stringify(
          role.Properties.Policies,
        )}`,
      )
    }

    policies.forEach((policy, policyIndex) => {
      const statements =
        policy && policy.PolicyDocument && policy.PolicyDocument.Statement
      // Whenever a Policies entry exists, its Statement must be a non-empty
      // array — an inline policy with no statements is invalid.
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new Error(
          `Role "${roleName}" Policies[${policyIndex}] has an empty/invalid ` +
            `PolicyDocument.Statement:\n${JSON.stringify(policy, null, 2)}`,
        )
      }

      statements.forEach((statement, statementIndex) => {
        const fail = (reason) => {
          throw new Error(
            `Empty collection on generated IAM role "${roleName}" ` +
              `Policies[${policyIndex}] Statement[${statementIndex}]: ${reason}` +
              `\n${JSON.stringify(statement, null, 2)}`,
          )
        }

        if (!('Effect' in statement)) fail('missing Effect')
        if (
          'Resource' in statement &&
          Array.isArray(statement.Resource) &&
          statement.Resource.length === 0
        ) {
          fail('Resource is an empty array (IAM rejects empty Resource)')
        }
        if (
          'Action' in statement &&
          Array.isArray(statement.Action) &&
          statement.Action.length === 0
        ) {
          fail('Action is an empty array')
        }
      })
    })
  }

  return roleEntries.length
}

describe('IAM empty-collection class invariant: generated roles never emit empty policy collections', () => {
  // 1. Baseline: single canonical function, no per-function IAM. Only the
  // shared role is generated; its log statements resolve to the canonical
  // wildcard log group.
  test('case 1: single canonical function, no per-function IAM (baseline)', () => {
    const { serverless, ctx, resources } = buildService({
      functions: { hello: { handler: 'h.h' } },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    expect(resources.IamRoleLambdaExecution).toBeDefined()
  })

  // 2. Function-level IAM statements via the new `iam.role.statements` shape —
  // a shape that previously produced empty Resource on the shared role. Must
  // NOT produce an empty Resource on the shared role, and the dedicated role
  // it earns must be valid too.
  test('case 2: single function with iam.role.statements (new-shape)', () => {
    const { serverless, ctx, resources } = buildService({
      functions: {
        writer: {
          handler: 'h.h',
          iam: {
            role: {
              statements: [
                {
                  Effect: 'Allow',
                  Action: ['s3:GetObject'],
                  Resource: ['arn:aws:s3:::my-bucket/*'],
                },
              ],
            },
          },
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    const dedicated =
      resources[
        serverless
          .getProvider('aws')
          .naming.getNormalizedFunctionName('writer') + 'IamRoleLambdaExecution'
      ]
    expect(dedicated).toBeDefined()
  })

  // 3. Function-level IAM statements via the legacy `iamRoleStatements`
  // shape — a shape that previously produced empty Resource on the shared
  // role.
  test('case 3: single function with legacy iamRoleStatements', () => {
    const { ctx, resources } = buildService({
      functions: {
        writer: {
          handler: 'h.h',
          iamRoleStatements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: ['arn:aws:s3:::my-bucket/*'],
            },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
  })

  // 4. Mixed: one dedicated (iam.role.statements) + one shared, both canonical.
  test('case 4: mixed dedicated + shared, both canonical', () => {
    const { ctx, resources } = buildService({
      functions: {
        dedicatedFn: {
          handler: 'h.h',
          iam: {
            role: {
              statements: [
                {
                  Effect: 'Allow',
                  Action: ['dynamodb:PutItem'],
                  Resource: ['arn:aws:dynamodb:us-east-1:123456789012:table/x'],
                },
              ],
            },
          },
        },
        sharedFn: { handler: 'h.h' },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
  })

  // 5. Mixed with events: a dedicated kinesis-stream fn, a shared sqs fn, and a
  // dedicated scheduler fn — all three event compilers run.
  test('case 5: mixed with kinesis/sqs/scheduler events (dedicated + shared)', () => {
    const { serverless, ctx, resources } = buildService({
      functions: {
        streamFn: {
          name: 'my-service-dev-streamFn',
          handler: 'h.h',
          iamRoleStatements: [],
          events: [{ stream: { arn: KINESIS_STREAM_ARN(1), type: 'kinesis' } }],
        },
        queueFn: {
          name: 'my-service-dev-queueFn',
          handler: 'h.h',
          events: [{ sqs: { arn: SQS_ARN(1) } }],
        },
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
    runEventCompilers(serverless, { stream: true, sqs: true, schedule: true })
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
  })

  // 6. Custom log group on a shared (non-dedicated) function. The shared role's
  // log statements resolve to the custom log group, not the canonical wildcard.
  test('case 6: custom log group, shared function', () => {
    const { ctx, resources } = buildService({
      functions: {
        loggy: {
          handler: 'h.h',
          logs: { logGroup: '/custom/loggy' },
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    expect(resources.IamRoleLambdaExecution).toBeDefined()
  })

  // 7. Custom log group on the ONLY function, which is dedicated. Its log
  // contribution is skipped from the shared role; the fallback path must keep
  // the shared role's log statements non-empty. This is the core fixed path.
  test('case 7: custom log group, single dedicated function (shared-role fallback)', () => {
    const { ctx, resources } = buildService({
      functions: {
        loggy: {
          handler: 'h.h',
          logs: { logGroup: '/custom/loggy' },
          iamRoleStatements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: ['arn:aws:s3:::b/*'],
            },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    expect(resources.IamRoleLambdaExecution).toBeDefined()
  })

  // 8. Custom-log dedicated fn + a canonical disableLogs fn. Exercises the
  // fallback wildcard AND the disableLogs Deny statement on the shared role.
  test('case 8: custom-log dedicated + canonical disableLogs (fallback + Deny)', () => {
    const { ctx, resources } = buildService({
      functions: {
        dedicatedLoggy: {
          handler: 'h.h',
          logs: { logGroup: '/custom/dedicatedLoggy' },
          iamRoleStatements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: ['arn:aws:s3:::b/*'],
            },
          ],
        },
        quiet: {
          handler: 'h.h',
          disableLogs: true,
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
  })

  // 9. Dedicated + shared functions sharing the SAME custom log group. The
  // shared fn contributes the log-group Resource so the shared role stays
  // valid; the dedicated fn's contribution is skipped.
  test('case 9: dedicated + shared sharing the same custom logGroup', () => {
    const { ctx, resources } = buildService({
      functions: {
        dedicatedFn: {
          handler: 'h.h',
          logs: { logGroup: '/custom/shared-lg' },
          iamRoleStatements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: ['arn:aws:s3:::b/*'],
            },
          ],
        },
        sharedFn: {
          handler: 'h.h',
          logs: { logGroup: '/custom/shared-lg' },
        },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    expect(resources.IamRoleLambdaExecution).toBeDefined()
  })

  // 10. provider.iam.role.mode: perFunction with a stream event. No shared role
  // exists; every function gets a per-function role carrying its own grants.
  test('case 10: provider.iam.role.mode perFunction with a stream event (per-function roles only)', () => {
    const { serverless, ctx, resources } = buildService({
      providerOverrides: { iam: { role: { mode: 'perFunction' } } },
      functions: {
        one: {
          name: 'my-service-dev-one',
          handler: 'h.h',
          events: [
            { stream: { arn: DYNAMODB_STREAM_ARN(1), type: 'dynamodb' } },
          ],
        },
        two: {
          name: 'my-service-dev-two',
          handler: 'h.h',
          events: [
            { stream: { arn: DYNAMODB_STREAM_ARN(2), type: 'dynamodb' } },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true })
    ctx.createRolesPerFunction()

    expect(resources.IamRoleLambdaExecution).toBeUndefined()
    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
  })

  // 11. External serverless-iam-roles-per-function plugin present + a function
  // with iam.role.statements. The finalize hook must skip role creation
  // entirely (behavior byte-unaffected); the shared role stays valid and no
  // dedicated role is created.
  test('case 11: external iam-roles-per-function plugin + iam.role.statements (guards inert)', () => {
    const { serverless, ctx, resources, provider } = buildService({
      functions: {
        writer: {
          handler: 'h.h',
          iam: {
            role: {
              statements: [
                {
                  Effect: 'Allow',
                  Action: ['s3:GetObject'],
                  Resource: ['arn:aws:s3:::b/*'],
                },
              ],
            },
          },
        },
      },
      plugins: [{ constructor: { name: 'ServerlessIamPerFunctionPlugin' } }],
    })

    ctx.mergeIamTemplates()
    ctx.handlePerFunctionRolesFinalizeHook()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    const dedicatedRoleLogicalId =
      provider.naming.getNormalizedFunctionName('writer') +
      provider.naming.getRoleLogicalId()
    expect(resources[dedicatedRoleLogicalId]).toBeUndefined()
  })

  // 12. Kitchen-sink dedicated function: kmsKeyArn, onError, destinations
  // onFailure, tracing, a kinesis stream with consumer:true AND a stream
  // onFailure destination, and vpc. The dedicated role must carry no empty
  // Resource/Action across all of those contributions.
  test('case 12: kitchen-sink dedicated function (kms/onError/destinations/tracing/consumer stream/vpc)', () => {
    const { serverless, ctx, resources, provider } = buildService({
      functions: {
        kitchenSink: {
          name: 'my-service-dev-kitchenSink',
          handler: 'h.h',
          iamRoleStatements: [],
          kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/abc',
          onError: SNS_ARN('err'),
          tracing: 'Active',
          vpc: {
            securityGroupIds: ['sg-1'],
            subnetIds: ['subnet-1'],
          },
          destinations: {
            onFailure: SQS_ARN('dest'),
          },
          events: [
            {
              stream: {
                arn: KINESIS_STREAM_ARN(9),
                type: 'kinesis',
                consumer: true,
                destinations: { onFailure: SNS_ARN('streamfail') },
              },
            },
          ],
        },
      },
    })

    ctx.mergeIamTemplates()
    runEventCompilers(serverless, { stream: true })
    ctx.createRolesPerFunction()

    expect(assertNoEmptyCollections(resources)).toBeGreaterThan(0)
    const dedicatedRoleLogicalId =
      provider.naming.getNormalizedFunctionName('kitchenSink') +
      provider.naming.getRoleLogicalId()
    expect(resources[dedicatedRoleLogicalId]).toBeDefined()
  })

  // Known exception: a service where EVERY function is canonical-named AND
  // sets disableLogs:true still emits an empty `Resource: []` on the shared
  // role's log statements (the baseline template ships empty Resource arrays,
  // and with no logging function to populate them and no dedicated-role skip
  // involved, nothing fills them). This is long-standing behavior independent
  // of per-function IAM scoping. We assert the current (empty) behavior so the
  // invariant suite stays honest and this gap is visible; the assertion will
  // start failing (prompting an update) once it is fixed at source.
  //
  // This case doubles as the detector's own live-fire coverage: every other
  // case in this suite only proves `assertNoEmptyCollections` passes on a
  // valid template, never that it actually throws on an invalid one. Here we
  // feed it this real, pipeline-generated empty-Resource template and assert
  // it throws, so a silently-broken (always-passing) detector would fail this
  // test too.
  test('known exception: all-disableLogs canonical service emits empty Resource on the shared role', () => {
    const { ctx, resources } = buildService({
      functions: {
        quiet: { handler: 'h.h', disableLogs: true },
      },
    })

    ctx.mergeIamTemplates()
    ctx.createRolesPerFunction()

    const statements =
      resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
        .Statement
    // Both baseline log statements currently retain the empty Resource array
    // inherited from the template — the pre-existing gap this test documents.
    expect(statements[0].Resource).toEqual([])
    expect(statements[1].Resource).toEqual([])

    // Proves the shared detector actually fires on this real violation (not
    // just correct-by-inspection against the 12 passing cases above).
    expect(() => assertNoEmptyCollections(resources)).toThrow(
      'Resource is an empty array',
    )
  })
})
