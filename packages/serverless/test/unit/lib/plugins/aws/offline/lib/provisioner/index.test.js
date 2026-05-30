import { jest } from '@jest/globals'
import { provision } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/index.js'
import { FAKE_REGION } from '../../../../../../../../lib/plugins/aws/offline/lib/constants.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal stub `serverless` object.
 *
 * `pluginManager.runHooks` is a no-op by default (compile hooks are stubbed by
 * pre-populating `compiledCloudFormationTemplate`). The compiled template is
 * pre-set so tests do not depend on actually running compile hooks.
 */
function makeServerless({
  service = 'offline-m0',
  stage = 'dev',
  compiledResources = {},
  compiledConditions,
  compiledParameters,
  compiledMappings,
  providerEnvironment = {},
  functions = {},
} = {}) {
  // `getProvider('aws').naming.getLambdaLogicalId` mirrors the Framework's own
  // convention so sibling-function ARN seeding works: upper-case the first
  // letter of the function key and append `LambdaFunction`.
  const provider = {
    naming: {
      getLambdaLogicalId: (key) =>
        `${key.charAt(0).toUpperCase()}${key.slice(1)}LambdaFunction`,
    },
  }

  // `driveCompile` reloads the core template from disk and only preserves the
  // pre-set `Resources`, then runs the finalize hooks. The real
  // `mergeCustomProviderResources` finalize hook is what merges the user's
  // `Conditions`/`Parameters`/`Mappings` into the compiled template, so the
  // stub `runHooks` mirrors that by applying them onto the live template.
  const runHooks = jest.fn(async () => {
    const template = sls.service.provider.compiledCloudFormationTemplate
    if (compiledConditions) template.Conditions = compiledConditions
    if (compiledParameters) template.Parameters = compiledParameters
    if (compiledMappings) template.Mappings = compiledMappings
  })

  const sls = {
    getProvider: () => provider,
    pluginManager: {
      hooks: {},
      runHooks,
    },
    service: {
      service,
      params: {},
      provider: {
        stage,
        environment: providerEnvironment,
        compiledCloudFormationTemplate: {
          Resources: compiledResources,
        },
      },
      functions,
    },
  }

  return sls
}

// ---------------------------------------------------------------------------
// 1. Stack name built from service + stage
// ---------------------------------------------------------------------------

it('1. builds stackName from service + stage', async () => {
  const sls = makeServerless({ service: 'offline-m0', stage: 'dev' })

  const { stackName } = await provision(sls)

  expect(stackName).toBe('offline-m0-dev')
})

// ---------------------------------------------------------------------------
// 2. SQS queue lifted from Resources
// ---------------------------------------------------------------------------

it('2. lifts SQS queue from Resources and stores it in registry', async () => {
  const sls = makeServerless({
    compiledResources: {
      MyQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: { VisibilityTimeout: 30 },
      },
    },
  })

  const { registry } = await provision(sls)

  const record = registry.sqs.get('MyQueue')
  expect(record).toBeDefined()
  expect(record.logicalId).toBe('MyQueue')
  expect(typeof record.name).toBe('string')
  expect(typeof record.arn).toBe('string')
  expect(typeof record.url).toBe('string')
  expect(record.properties).toBeDefined()
})

// ---------------------------------------------------------------------------
// 3. Non-SQS resources are skipped
// ---------------------------------------------------------------------------

it('3. skips non-SQS resources; only SQS ends up in the registry', async () => {
  const sls = makeServerless({
    compiledResources: {
      Bucket: { Type: 'AWS::S3::Bucket' },
      MyQueue: { Type: 'AWS::SQS::Queue' },
    },
  })

  const { registry } = await provision(sls)

  expect(registry.sqs.size).toBe(1)
  expect(registry.sqs.has('MyQueue')).toBe(true)
  expect(registry.sqs.has('Bucket')).toBe(false)
})

// ---------------------------------------------------------------------------
// 4. Empty Resources is OK
// ---------------------------------------------------------------------------

it('4. handles empty Resources without error and returns empty registry', async () => {
  const sls = makeServerless({ compiledResources: {} })

  const { registry } = await provision(sls)

  expect(registry.sqs.size).toBe(0)
})

// ---------------------------------------------------------------------------
// 5. Function env re-rendered (Ref resolved to queue URL)
// ---------------------------------------------------------------------------

it('5. re-renders function environment — Ref to SQS queue resolves to URL', async () => {
  const sls = makeServerless({
    compiledResources: {
      MyQueue: { Type: 'AWS::SQS::Queue' },
    },
    functions: {
      myFn: {
        environment: { QUEUE_URL: { Ref: 'MyQueue' } },
      },
    },
  })

  await provision(sls)

  const fn = sls.service.functions.myFn
  expect(typeof fn.environment.QUEUE_URL).toBe('string')
  expect(fn.environment.QUEUE_URL).toMatch(/^http:\/\/localhost:\d+\//)
})

// ---------------------------------------------------------------------------
// 6. Provider env merged into function env; function-level wins on collision
// ---------------------------------------------------------------------------

it('6. merges provider env into function env; function-level wins on collision', async () => {
  const sls = makeServerless({
    compiledResources: {
      MyQueue: { Type: 'AWS::SQS::Queue' },
    },
    providerEnvironment: { LOG_LEVEL: 'info', SHARED_KEY: 'provider-value' },
    functions: {
      myFn: {
        environment: {
          QUEUE_URL: { Ref: 'MyQueue' },
          SHARED_KEY: 'function-value',
        },
      },
    },
  })

  await provision(sls)

  const env = sls.service.functions.myFn.environment
  // Provider-only key present
  expect(env.LOG_LEVEL).toBe('info')
  // Function-level key present (resolved)
  expect(typeof env.QUEUE_URL).toBe('string')
  // Function-level wins over provider-level on collision
  expect(env.SHARED_KEY).toBe('function-value')
})

// ---------------------------------------------------------------------------
// 7. Pseudo-params resolved in function env
// ---------------------------------------------------------------------------

it('7. resolves pseudo-parameter Ref in function environment', async () => {
  const sls = makeServerless({
    compiledResources: {},
    functions: {
      myFn: {
        environment: { REGION: { Ref: 'AWS::Region' } },
      },
    },
  })

  await provision(sls)

  expect(sls.service.functions.myFn.environment.REGION).toBe(FAKE_REGION)
})

// ---------------------------------------------------------------------------
// 8. Intrinsics in function events[] are resolved
// ---------------------------------------------------------------------------

it('8. resolves intrinsics in function events[] declarations', async () => {
  const sls = makeServerless({
    compiledResources: {
      MyQueue: { Type: 'AWS::SQS::Queue', Properties: {} },
    },
    functions: {
      consumer: {
        handler: 'src/c.handler',
        events: [{ sqs: { arn: { 'Fn::GetAtt': ['MyQueue', 'Arn'] } } }],
      },
    },
  })

  await provision(sls)

  const arn = sls.service.functions.consumer.events[0].sqs.arn
  expect(typeof arn).toBe('string')
  expect(arn).toMatch(/^arn:aws:sqs:/)
  expect(arn).toContain('MyQueue')
})

// ---------------------------------------------------------------------------
// 9. Function with no events does not crash
// ---------------------------------------------------------------------------

it('9. function with no events property does not crash', async () => {
  const sls = makeServerless({
    compiledResources: {},
    functions: {
      myFn: {
        handler: 'src/fn.handler',
        // no `events` key at all
      },
    },
  })

  await expect(provision(sls)).resolves.not.toThrow()
})

// ---------------------------------------------------------------------------
// 10. Uses the configured awsApiPort in lifted queue URLs
// ---------------------------------------------------------------------------

it('10. uses the configured awsApiPort in lifted queue URLs', async () => {
  const sls = makeServerless({
    compiledResources: {
      MyQueue: { Type: 'AWS::SQS::Queue' },
    },
  })

  const { registry } = await provision(sls, { awsApiPort: 4567 })

  const record = registry.sqs.get('MyQueue')
  expect(record).toBeDefined()
  expect(record.url).toContain(':4567/')
})

// ---------------------------------------------------------------------------
// 11. End-to-end: mixed template, cross-function refs, conditions, imports
// ---------------------------------------------------------------------------

it('11. provisions a mixed template end-to-end with cross references, conditions, and a dropped cross-stack import', async () => {
  const sls = makeServerless({
    compiledConditions: {
      // A condition that always evaluates to false, gating off a resource.
      CreateAnalytics: { 'Fn::Equals': ['enabled', 'disabled'] },
    },
    compiledResources: {
      UploadsBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: { BucketName: 'uploads-bucket' },
      },
      OrdersTopic: { Type: 'AWS::SNS::Topic' },
      JobsQueue: { Type: 'AWS::SQS::Queue' },
      // Gated off by a false condition — must not appear in the registry.
      AnalyticsBucket: {
        Type: 'AWS::S3::Bucket',
        Condition: 'CreateAnalytics',
        Properties: { BucketName: 'analytics-bucket' },
      },
    },
    functions: {
      api: {
        handler: 'src/api.handler',
        environment: {
          BUCKET_NAME: { Ref: 'UploadsBucket' },
          BUCKET_ARN: { 'Fn::GetAtt': ['UploadsBucket', 'Arn'] },
          // Reference a sibling function's ARN via its CFN logical id.
          WORKER_ARN: { 'Fn::GetAtt': ['WorkerLambdaFunction', 'Arn'] },
          // A cross-stack import that cannot exist offline → dropped.
          SHARED_X: { 'Fn::ImportValue': 'Shared-X' },
        },
      },
      worker: { handler: 'src/worker.handler' },
    },
  })

  const { registry, warnings } = await provision(sls)

  // Supported resources lifted into the registry.
  expect(registry.s3.has('UploadsBucket')).toBe(true)
  expect(registry.sns.has('OrdersTopic')).toBe(true)
  expect(registry.sqs.has('JobsQueue')).toBe(true)

  // Condition-false resource absent from the registry.
  expect(registry.s3.has('AnalyticsBucket')).toBe(false)

  const env = sls.service.functions.api.environment
  // Ref to a bucket resolves to its name.
  expect(env.BUCKET_NAME).toBe('uploads-bucket')
  // Fn::GetAtt …Arn resolves to the S3 ARN.
  expect(env.BUCKET_ARN).toBe('arn:aws:s3:::uploads-bucket')
  // Sibling-function ARN resolves via the seeded Lambda identity.
  expect(env.WORKER_ARN).toBe(
    'arn:aws:lambda:us-east-1:000000000000:function:worker',
  )
  // Cross-stack import key is dropped.
  expect('SHARED_X' in env).toBe(false)

  // A cross-stack-reference warning is surfaced.
  expect(warnings.some((w) => w.code === 'OFFLINE_CROSS_STACK_REFERENCE')).toBe(
    true,
  )
})
