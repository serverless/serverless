import ServerlessError from '../../../../../serverless-error.js'

const KNOWN_INTRINSICS = new Set(['Ref', 'Fn::GetAtt', 'Fn::ImportValue'])
const NO_VALUE = Symbol.for('AWS::NoValue')

/**
 * Walks an arbitrary JSON-y CloudFormation value tree and replaces supported
 * intrinsics (`Ref`, `Fn::GetAtt`, `Fn::ImportValue`) with synthesised local
 * values sourced from the resource registry and pseudo-parameter map.
 *
 * This is a spike-scoped resolver (M0.5 / D-9): it supports only the minimum
 * intrinsics required for the SQS smoke fixture.  Unsupported `Fn::*` keys
 * throw `OFFLINE_UNSUPPORTED_INTRINSIC` so callers get an actionable error
 * rather than silently wrong values.
 *
 * @param {unknown} value
 *   The CFN value tree to resolve.  May be a primitive, array, or plain
 *   object potentially containing intrinsic nodes.
 *
 * @param {{
 *   registry: {
 *     sqs: Map<string, { logicalId: string, url: string, arn: string, name: string }>,
 *     sns: Map<string, { logicalId: string, arn: string }>,
 *     s3: Map<string, unknown>,
 *     events: Map<string, unknown>,
 *     lambda: Map<string, unknown>,
 *   },
 *   parameters: Record<string, unknown>,
 *   pseudoParams: {
 *     'AWS::AccountId': string,
 *     'AWS::Region': string,
 *     'AWS::Partition': string,
 *     'AWS::URLSuffix': string,
 *     'AWS::StackName': string,
 *     'AWS::NoValue': symbol,
 *   },
 * }} context
 *   Resolution context supplying the resource registry and pseudo-parameters.
 *
 * @returns {unknown} The resolved value, deep-equal to the input when no
 *   intrinsics are present.
 *
 * @throws {ServerlessError} OFFLINE_UNRESOLVED_REF — `{ Ref: '<id>' }` where
 *   `<id>` is neither a pseudo-param nor a known registry entry.
 * @throws {ServerlessError} OFFLINE_UNRESOLVED_GETATT — `{ 'Fn::GetAtt': [...] }`
 *   where the logical ID is unknown or the attribute is unsupported.
 * @throws {ServerlessError} OFFLINE_UNSUPPORTED_INTRINSIC — any other `Fn::*`
 *   key encountered in the tree.
 * @throws {ServerlessError} OFFLINE_CROSS_STACK_IMPORT — `{ 'Fn::ImportValue': '...' }`.
 */
export function resolveIntrinsics(value, context) {
  // Primitives — return as-is (bare strings that look like pseudo-param keys
  // are NOT substituted; only { Ref: 'AWS::Region' } triggers substitution).
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  // Arrays — recurse over each element.
  if (Array.isArray(value)) {
    return value.map((item) => resolveIntrinsics(item, context))
  }

  // Objects — check for intrinsic node first.
  const keys = Object.keys(value)

  if (keys.length === 1) {
    const key = keys[0]

    if (key === 'Ref') {
      return resolveRef(value.Ref, context)
    }

    if (key === 'Fn::GetAtt') {
      return resolveGetAtt(value['Fn::GetAtt'], context)
    }

    if (key === 'Fn::ImportValue') {
      throw new ServerlessError(
        `Fn::ImportValue is not supported in offline mode — cross-stack references must be resolved externally.`,
        'OFFLINE_CROSS_STACK_IMPORT',
      )
    }

    if (key.startsWith('Fn::')) {
      throw new ServerlessError(
        `Intrinsic "${key}" is not supported in offline mode (spike scope). It will be implemented in M7.5.`,
        'OFFLINE_UNSUPPORTED_INTRINSIC',
      )
    }
  }

  // Plain object — recurse over each value, dropping keys that resolve to
  // the AWS::NoValue sentinel.
  const result = {}
  for (const [k, v] of Object.entries(value)) {
    const resolved = resolveIntrinsics(v, context)
    if (resolved !== NO_VALUE) {
      result[k] = resolved
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRef(id, context) {
  const { pseudoParams, registry } = context

  // Pseudo-parameters take priority.
  if (Object.prototype.hasOwnProperty.call(pseudoParams, id)) {
    return pseudoParams[id]
  }

  // SQS queues — Ref resolves to the queue URL.
  if (registry.sqs.has(id)) {
    return registry.sqs.get(id).url
  }

  // SNS topics — Ref resolves to the topic ARN.
  if (registry.sns.has(id)) {
    return registry.sns.get(id).arn
  }

  throw new ServerlessError(
    `Cannot resolve { Ref: '${id}' } — no pseudo-parameter, SQS queue, or SNS topic with logical ID "${id}" found in the offline registry.`,
    'OFFLINE_UNRESOLVED_REF',
  )
}

function resolveGetAtt(spec, context) {
  // Normalise string short-form "LogicalId.Attribute" to array form.
  let logicalId, attribute
  if (typeof spec === 'string') {
    const dot = spec.indexOf('.')
    if (dot === -1) {
      throw new ServerlessError(
        `Fn::GetAtt string form "${spec}" must contain a "." separator.`,
        'OFFLINE_UNRESOLVED_GETATT',
      )
    }
    logicalId = spec.slice(0, dot)
    attribute = spec.slice(dot + 1)
  } else if (Array.isArray(spec) && spec.length === 2) {
    ;[logicalId, attribute] = spec
  } else {
    throw new ServerlessError(
      `Fn::GetAtt value must be a [LogicalId, Attribute] array or a "LogicalId.Attribute" string.`,
      'OFFLINE_UNRESOLVED_GETATT',
    )
  }

  const { registry } = context

  if (registry.sqs.has(logicalId)) {
    const q = registry.sqs.get(logicalId)
    switch (attribute) {
      case 'Arn':
        return q.arn
      case 'QueueName':
        return q.name
      case 'QueueUrl':
        return q.url
      default:
        throw new ServerlessError(
          `Fn::GetAtt ["${logicalId}", "${attribute}"] — attribute "${attribute}" is not supported for AWS::SQS::Queue in offline mode.`,
          'OFFLINE_UNRESOLVED_GETATT',
        )
    }
  }

  throw new ServerlessError(
    `Fn::GetAtt ["${logicalId}", "${attribute}"] — no resource with logical ID "${logicalId}" found in the offline registry.`,
    'OFFLINE_UNRESOLVED_GETATT',
  )
}
