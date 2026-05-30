import { driveCompile } from './compile-driver.js'
import { createRegistry } from './registry.js'
import { resolveIntrinsics } from './local-intrinsic-resolver.js'
import { evaluateConditions } from './condition-eval.js'
import { seedLambdaIdentities } from './lambda-identities.js'
import { walkResources } from './template-walker.js'
import { rerenderFunctionEnvironments } from './env-rerender.js'
import { formatProvisionedResources } from './boot-log.js'
import {
  DEFAULT_AWS_API_PORT,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from '../constants.js'
import { getStage } from '../stage.js'

/**
 * Boot-time orchestration for `sls offline`.
 *
 * Wires together the compile driver, condition evaluator, resource registry,
 * intrinsic resolver, ARN synthesizer, and per-type lifters to produce a fully
 * populated registry from the service's compiled CloudFormation template, and
 * re-renders every function's environment so intrinsic references (e.g.
 * `{ Ref: 'MyQueue' }`) are replaced with real local values.
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
 * The host `process.env` is never touched.
 *
 * @param {object} serverless
 *   The Serverless instance. Must have `service`, `service.provider`,
 *   `service.functions`, and `pluginManager` populated.
 * @param {{ awsApiPort?: number, logger?: object }} [options]
 *   Optional configuration. `awsApiPort` controls the port embedded in
 *   synthesized queue URLs; defaults to `DEFAULT_AWS_API_PORT`. `logger`, when
 *   supplied, receives one line per unresolved-reference warning and the
 *   provisioned-resource summary.
 * @returns {Promise<{ registry: object, stackName: string, warnings: Array<{ code: string, reference: string, detail: string }> }>}
 *   The populated resource registry, the derived CloudFormation stack name, and
 *   any warnings raised while resolving references.
 */
export async function provision(
  serverless,
  { awsApiPort = DEFAULT_AWS_API_PORT, logger } = {},
) {
  const { service } = serverless

  // 1. Derive the CloudFormation stack name.
  const stackName = `${service.service}-${getStage(serverless)}`

  // 2. Drive the compile lifecycle to populate compiledCloudFormationTemplate.
  await driveCompile(serverless)

  const template = service.provider.compiledCloudFormationTemplate

  // 3. Build the full pseudo-parameter set.
  const pseudoParams = {
    'AWS::AccountId': FAKE_ACCOUNT_ID,
    'AWS::Region': FAKE_REGION,
    'AWS::Partition': 'aws',
    'AWS::URLSuffix': 'amazonaws.com',
    'AWS::StackName': stackName,
    'AWS::StackId': `arn:aws:cloudformation:${FAKE_REGION}:${FAKE_ACCOUNT_ID}:stack/${stackName}/offline`,
    'AWS::NotificationARNs': [],
    'AWS::NoValue': Symbol.for('AWS::NoValue'),
  }

  // 4. Collect template-parameter defaults, overlaid with any supplied params.
  const templateParameters = template.Parameters ?? {}
  const defaultsFromTemplateParameters = {}
  for (const [name, definition] of Object.entries(templateParameters)) {
    if (definition && 'Default' in definition) {
      defaultsFromTemplateParameters[name] = definition.Default
    }
  }
  const parameters = {
    ...defaultsFromTemplateParameters,
    ...(service.params ?? {}),
  }

  // 5. Mappings and condition evaluation.
  const mappings = template.Mappings ?? {}
  const conditions = evaluateConditions(template, {
    parameters,
    pseudoParams,
    mappings,
  })

  // 6. Fresh registry + warnings sink.
  const registry = createRegistry()
  const warnings = []

  // 7. Pre-register local function identities so cross-function references
  //    (Ref / Fn::GetAtt against a sibling's …LambdaFunction logical id)
  //    resolve to a consistent local ARN.
  seedLambdaIdentities(serverless, registry)

  // 8. Bind the resolver to the full resolution context.
  const resolveIntrinsicsBound = (value) =>
    resolveIntrinsics(value, {
      registry,
      parameters,
      pseudoParams,
      conditions,
      mappings,
      warnings,
    })

  // 9. Walk Resources and lift every supported type into the registry.
  walkResources(template, {
    resolveIntrinsics: resolveIntrinsicsBound,
    conditions,
    registry,
    awsApiPort,
  })

  // 10. Re-render function environments and event declarations.
  rerenderFunctionEnvironments(serverless, {
    resolveIntrinsics: resolveIntrinsicsBound,
  })

  // 11. Surface warnings and the provisioned-resource summary if a logger is
  //     supplied. Each call is guarded so a partial logger shape never throws.
  if (logger) {
    if (typeof logger.warn === 'function') {
      for (const { code, reference, detail } of warnings) {
        logger.warn(`[${code}] ${reference}: ${detail}`)
      }
    }
    const summaryLines = formatProvisionedResources(registry)
    const emit =
      typeof logger.info === 'function'
        ? logger.info.bind(logger)
        : typeof logger.log === 'function'
          ? logger.log.bind(logger)
          : undefined
    if (emit) {
      for (const line of summaryLines) {
        emit(line)
      }
    }
  }

  // 12. Return the populated registry, the stack name, and any warnings.
  return { registry, stackName, warnings }
}
