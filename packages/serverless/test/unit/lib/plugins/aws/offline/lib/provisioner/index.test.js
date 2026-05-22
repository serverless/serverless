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
  providerEnvironment = {},
  functions = {},
} = {}) {
  return {
    pluginManager: {
      hooks: {},
      runHooks: jest.fn().mockResolvedValue(undefined),
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
