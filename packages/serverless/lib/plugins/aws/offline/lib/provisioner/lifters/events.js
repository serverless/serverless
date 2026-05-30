import { arnFor, eventRuleArnFor } from '../arn-synth.js'
import ServerlessError from '../../../../../../serverless-error.js'

const BUS_TYPE = 'AWS::Events::EventBus'
const RULE_TYPE = 'AWS::Events::Rule'

/**
 * Reads one CloudFormation EventBridge resource — an `AWS::Events::EventBus` or
 * `AWS::Events::Rule` — and produces a record for the offline registry.
 *
 * The resource name comes from a literal `Name` property when present;
 * otherwise it falls back to the logical ID. Buses carry an `event-bus/` ARN;
 * rules carry a `rule/` ARN.
 *
 * @param {string} logicalId
 *   The CloudFormation Resources key.
 * @param {{ Type: string, Properties?: object }} cfnResource
 *   The raw CFN resource object. `Properties` is optional.
 * @param {{ resolveIntrinsics: (value: unknown) => unknown }} context
 *   Resolver context. `resolveIntrinsics` is applied to `Properties`.
 * @returns {{ logicalId: string, name: string, arn: string, kind: 'bus'|'rule', properties: object }}
 *   The EventBridge record.
 * @throws {ServerlessError} OFFLINE_LIFTER_WRONG_TYPE if the resource is neither
 *   an `AWS::Events::EventBus` nor an `AWS::Events::Rule`.
 */
export function liftEventResource(logicalId, cfnResource, context) {
  const { Type } = cfnResource
  if (Type !== BUS_TYPE && Type !== RULE_TYPE) {
    throw new ServerlessError(
      `liftEventResource expected Type "${BUS_TYPE}" or "${RULE_TYPE}" but received "${Type}".`,
      'OFFLINE_LIFTER_WRONG_TYPE',
    )
  }

  const properties = context.resolveIntrinsics(cfnResource.Properties ?? {})
  const name = typeof properties.Name === 'string' ? properties.Name : logicalId
  const kind = Type === BUS_TYPE ? 'bus' : 'rule'
  const arn = kind === 'bus' ? arnFor('events', name) : eventRuleArnFor(name)

  return {
    logicalId,
    name,
    arn,
    kind,
    properties,
  }
}
