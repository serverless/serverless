import { liftSqsQueue } from './lifters/sqs.js'
import { liftSnsTopic } from './lifters/sns.js'
import { liftS3Bucket } from './lifters/s3.js'
import { liftEventResource } from './lifters/events.js'
import {
  registerSqsQueue,
  registerSnsTopic,
  registerS3Bucket,
  registerEventResource,
} from './registry.js'

/**
 * Walks a compiled CloudFormation template's `Resources` block, lifts every
 * supported resource type into a local record, and stores it in the registry.
 *
 * A resource whose `Condition` names a condition that evaluated to `false` is
 * skipped (it would not exist after a real deployment). Unsupported resource
 * types are silently ignored — they are not provisioned locally but must not
 * abort the boot.
 *
 * @param {{ Resources?: Record<string, { Type: string, Condition?: string, Properties?: object }> }} template
 *   The compiled CloudFormation template.
 * @param {{
 *   resolveIntrinsics: (value: unknown) => unknown,
 *   conditions: Map<string, boolean>,
 *   registry: ReturnType<import('./registry.js').createRegistry>,
 *   awsApiPort: number,
 * }} context
 *   The resolver helper, evaluated conditions, target registry, and the port
 *   embedded in synthesized queue URLs.
 * @returns {void}
 */
export function walkResources(
  template,
  { resolveIntrinsics, conditions, registry, awsApiPort },
) {
  const resources = template?.Resources ?? {}

  for (const [logicalId, resource] of Object.entries(resources)) {
    // Skip resources gated off by a false condition — they would not exist
    // after a real deployment.
    if (
      resource.Condition &&
      conditions &&
      conditions.get(resource.Condition) === false
    ) {
      continue
    }

    switch (resource.Type) {
      case 'AWS::SQS::Queue':
        registerSqsQueue(
          registry,
          liftSqsQueue(logicalId, resource, { resolveIntrinsics, awsApiPort }),
        )
        break
      case 'AWS::SNS::Topic':
        registerSnsTopic(
          registry,
          liftSnsTopic(logicalId, resource, { resolveIntrinsics }),
        )
        break
      case 'AWS::S3::Bucket':
        registerS3Bucket(
          registry,
          liftS3Bucket(logicalId, resource, { resolveIntrinsics }),
        )
        break
      case 'AWS::Events::EventBus':
      case 'AWS::Events::Rule':
        registerEventResource(
          registry,
          liftEventResource(logicalId, resource, { resolveIntrinsics }),
        )
        break
      default:
      // Unsupported type — silently ignored.
    }
  }
}
