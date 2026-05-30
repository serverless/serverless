import { arnFor } from '../arn-synth.js'
import ServerlessError from '../../../../../../serverless-error.js'

/**
 * Reads one CloudFormation resource of type `AWS::SNS::Topic` and produces a
 * record for the offline registry.
 *
 * The topic name comes from a literal `TopicName` property when present;
 * otherwise it falls back to the logical ID (CloudFormation auto-generates a
 * name in that case, and the logical ID is a stable, predictable stand-in that
 * stays consistent with how `Ref`/`Fn::GetAtt` resolve the same record).
 *
 * @param {string} logicalId
 *   The CloudFormation Resources key (e.g. `'OrdersTopic'`).
 * @param {{ Type: string, Properties?: object }} cfnResource
 *   The raw CFN resource object. `Properties` is optional.
 * @param {{ resolveIntrinsics: (value: unknown) => unknown }} context
 *   Resolver context. `resolveIntrinsics` is applied to `Properties` so
 *   intrinsic functions are substituted before the record is built.
 * @returns {{ logicalId: string, name: string, arn: string }} The SNS record.
 * @throws {ServerlessError} OFFLINE_LIFTER_WRONG_TYPE if the resource is not an
 *   `AWS::SNS::Topic`.
 */
export function liftSnsTopic(logicalId, cfnResource, context) {
  if (cfnResource.Type !== 'AWS::SNS::Topic') {
    throw new ServerlessError(
      `liftSnsTopic expected Type "AWS::SNS::Topic" but received "${cfnResource.Type}".`,
      'OFFLINE_LIFTER_WRONG_TYPE',
    )
  }

  const properties = context.resolveIntrinsics(cfnResource.Properties ?? {})
  const name =
    typeof properties.TopicName === 'string' ? properties.TopicName : logicalId

  return {
    logicalId,
    name,
    arn: arnFor('sns', name),
  }
}
