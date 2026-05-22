import { arnFor, queueUrlFor } from '../arn-synth.js'
import ServerlessError from '../../../../../../serverless-error.js'
import { DEFAULT_AWS_API_PORT } from '../../constants.js'

/**
 * Reads one CloudFormation resource entry of type `AWS::SQS::Queue` and
 * produces an `SqsRecord` suitable for storing in the offline registry.
 *
 * @param {string} logicalId
 *   The CloudFormation Resources key (e.g. `'MyQueue'`).
 *
 * @param {{ Type: string, Properties?: object }} cfnResource
 *   The raw CFN resource object.  `Properties` is optional — omitting it is
 *   valid CFN and is treated as an empty properties map.
 *
 * @param {{
 *   resolveIntrinsics: (value: unknown) => unknown,
 *   registry: object,
 *   pseudoParams: object,
 *   awsApiPort?: number,
 * }} context
 *   Resolver context.  `resolveIntrinsics` is called on the Properties object
 *   before the record is constructed so callers can substitute
 *   `Ref` / `Fn::GetAtt` values.  `awsApiPort` controls the port embedded
 *   in the synthesized queue URL; defaults to `DEFAULT_AWS_API_PORT`.
 *
 * @returns {{
 *   logicalId:  string,
 *   name:       string,
 *   arn:        string,
 *   url:        string,
 *   properties: object,
 * }} The synthesised SQS record.
 *
 * @throws {ServerlessError} With code `OFFLINE_LIFTER_WRONG_TYPE` if
 *   `cfnResource.Type` is not `'AWS::SQS::Queue'`.
 */
export function liftSqsQueue(logicalId, cfnResource, context) {
  if (cfnResource.Type !== 'AWS::SQS::Queue') {
    throw new ServerlessError(
      `liftSqsQueue expected Type "AWS::SQS::Queue" but received "${cfnResource.Type}".`,
      'OFFLINE_LIFTER_WRONG_TYPE',
    )
  }

  const { resolveIntrinsics, awsApiPort = DEFAULT_AWS_API_PORT } = context

  // Properties is optional in CloudFormation; default to empty object.
  const rawProperties = cfnResource.Properties ?? {}
  const properties = resolveIntrinsics(rawProperties)

  // Derive the queue name: use a literal QueueName if provided, otherwise
  // fall back to the logical ID (CFN auto-generates a name; uses logicalId
  // for simplicity).
  const name =
    typeof properties.QueueName === 'string' ? properties.QueueName : logicalId

  const arn = arnFor('sqs', name)
  const url = queueUrlFor(name, awsApiPort)

  return {
    logicalId,
    name,
    arn,
    url,
    properties,
  }
}
