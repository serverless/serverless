import { driveCompile } from './compile-driver.js'
import { createRegistry, registerSqsQueue } from './registry.js'
import { liftSqsQueue } from './lifters/sqs.js'
import { resolveIntrinsics } from './local-intrinsic-resolver.js'
import {
  DEFAULT_AWS_API_PORT,
  DEFAULT_STAGE,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from '../constants.js'

/**
 * Boot-time orchestration for `sls offline`.
 *
 * Wires together the compile driver, resource registry, intrinsic resolver,
 * ARN synthesizer, and SQS lifter modules to produce a fully populated
 * registry from the service's CloudFormation template, and re-renders every
 * function's environment so intrinsic references (e.g. `{ Ref: 'MyQueue' }`)
 * are replaced with real local values.
 *
 * ## Side effects on `serverless.service`
 *
 * - **`serverless.service.provider.compiledCloudFormationTemplate`** may be
 *   mutated by `driveCompile()` when the compile hooks actually run.
 * - **`serverless.service.functions[*].environment`** is replaced with a
 *   new plain object that merges provider-level and function-level
 *   environment variables, with all intrinsic functions resolved.
 * - **`serverless.service.functions[*].events`** is replaced with a new
 *   array where every event entry has had its intrinsic functions resolved
 *   (e.g. `{ 'Fn::GetAtt': ['MyQueue', 'Arn'] }` → the real ARN string).
 *
 * @param {object} serverless
 *   The Serverless instance.  Must have `service`, `service.provider`,
 *   `service.functions`, and `pluginManager` populated.
 * @param {{ awsApiPort?: number }} [options]
 *   Optional configuration. `awsApiPort` controls the port embedded in
 *   synthesized queue URLs; defaults to `DEFAULT_AWS_API_PORT`.
 * @returns {Promise<{ registry: object, stackName: string }>}
 *   The populated resource registry and the derived CloudFormation stack name.
 */
export async function provision(
  serverless,
  { awsApiPort = DEFAULT_AWS_API_PORT } = {},
) {
  const { service } = serverless

  // 1. Derive the CloudFormation stack name.
  const stackName = `${service.service}-${service.provider.stage ?? DEFAULT_STAGE}`

  // 2. Drive the compile lifecycle to populate compiledCloudFormationTemplate.
  await driveCompile(serverless)

  // 3. Create a fresh resource registry.
  const registry = createRegistry()

  // 4. Build the intrinsic-resolver context and the bound helper.
  const context = {
    registry,
    awsApiPort,
    parameters: service.params ?? {},
    pseudoParams: {
      'AWS::AccountId': FAKE_ACCOUNT_ID,
      'AWS::Region': FAKE_REGION,
      'AWS::Partition': 'aws',
      'AWS::URLSuffix': 'amazonaws.com',
      'AWS::StackName': stackName,
      'AWS::NoValue': Symbol.for('AWS::NoValue'),
    },
  }

  const resolveIntrinsicsBound = (value) => resolveIntrinsics(value, context)

  // 5. Walk Resources; lift SQS queues, skip everything else.
  const template = service.provider.compiledCloudFormationTemplate
  const resources = template.Resources ?? {}

  for (const [logicalId, resource] of Object.entries(resources)) {
    if (resource.Type === 'AWS::SQS::Queue') {
      const record = liftSqsQueue(logicalId, resource, {
        resolveIntrinsics: resolveIntrinsicsBound,
        registry,
        ...context,
      })
      registerSqsQueue(registry, record)
    }
    // All other resource types are silently skipped (only SQS is lifted in this build).
  }

  // 6. Re-render function environments.
  //    Merge provider-level env with function-level env (function wins on
  //    collision), then resolve all intrinsics in the merged map.
  const providerEnv = service.provider.environment ?? {}
  const functions = service.functions ?? {}

  for (const fn of Object.values(functions)) {
    const fnEnv = fn.environment ?? {}
    const merged = { ...providerEnv, ...fnEnv }
    fn.environment = resolveIntrinsicsBound(merged)
  }

  // 7. Resolve intrinsics in function event declarations.
  //    Event-source configs (e.g. SQS ARNs supplied as Fn::GetAtt) must be
  //    resolved before the SQS poller reads them, otherwise they remain as
  //    raw CFN objects and trigger OFFLINE_SQS_UNRESOLVED_ARN.
  for (const fn of Object.values(functions)) {
    if (Array.isArray(fn.events)) {
      fn.events = fn.events.map((ev) => resolveIntrinsicsBound(ev))
    }
  }

  // 8. Return the populated registry and stack name.
  return { registry, stackName }
}
