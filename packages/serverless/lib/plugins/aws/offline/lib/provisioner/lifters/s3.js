import { arnFor } from '../arn-synth.js'
import ServerlessError from '../../../../../../serverless-error.js'

/**
 * Reads one CloudFormation resource of type `AWS::S3::Bucket` and produces a
 * record for the offline registry.
 *
 * The bucket name comes from a literal `BucketName` property when present;
 * otherwise it falls back to the logical ID (CloudFormation auto-generates a
 * name in that case, and the logical ID is a stable, predictable stand-in that
 * stays consistent with how `Ref`/`Fn::GetAtt` resolve the same record).
 *
 * @param {string} logicalId
 *   The CloudFormation Resources key (e.g. `'UploadsBucket'`).
 * @param {{ Type: string, Properties?: object }} cfnResource
 *   The raw CFN resource object. `Properties` is optional.
 * @param {{ resolveIntrinsics: (value: unknown) => unknown }} context
 *   Resolver context. `resolveIntrinsics` is applied to `Properties` so
 *   intrinsic functions are substituted before the record is built.
 * @returns {{ logicalId: string, name: string, arn: string, properties: object }}
 *   The S3 bucket record (Properties retained for downstream notification wiring).
 * @throws {ServerlessError} OFFLINE_LIFTER_WRONG_TYPE if the resource is not an
 *   `AWS::S3::Bucket`.
 */
export function liftS3Bucket(logicalId, cfnResource, context) {
  if (cfnResource.Type !== 'AWS::S3::Bucket') {
    throw new ServerlessError(
      `liftS3Bucket expected Type "AWS::S3::Bucket" but received "${cfnResource.Type}".`,
      'OFFLINE_LIFTER_WRONG_TYPE',
    )
  }

  const properties = context.resolveIntrinsics(cfnResource.Properties ?? {})
  const name =
    typeof properties.BucketName === 'string'
      ? properties.BucketName
      : logicalId

  return {
    logicalId,
    name,
    arn: arnFor('s3', name),
    properties,
  }
}
