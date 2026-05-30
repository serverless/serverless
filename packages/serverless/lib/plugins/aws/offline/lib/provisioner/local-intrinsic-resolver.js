import ServerlessError from '../../../../../serverless-error.js'
import {
  s3DomainName,
  s3RegionalDomainName,
  s3WebsiteUrl,
} from './arn-synth.js'

/**
 * Sentinel for `AWS::NoValue`. A value resolving to this is dropped from its
 * containing object's key (and from arrays it appears in).
 */
const NO_VALUE = Symbol.for('AWS::NoValue')

/**
 * Sentinel for a reference that cannot be resolved locally. It propagates up
 * through container intrinsics and, when it lands as a plain-object value,
 * causes that key to be dropped. Exported so sibling modules and tests can
 * recognise it.
 */
export const UNRESOLVED = Symbol.for('OFFLINE::Unresolved')

/**
 * Resolves CloudFormation intrinsic functions against a local registry of
 * provisioned resources and pseudo-parameter values.
 *
 * `Ref` is resolved for every provisioned resource type and for template
 * parameters. A reference that cannot be resolved becomes the `UNRESOLVED`
 * sentinel and a warning is pushed onto `context.warnings` rather than
 * throwing, so booting offline never crashes on a missing reference.
 *
 * @param {unknown} value
 *   The CFN value tree to resolve. May be a primitive, array, or plain object
 *   potentially containing intrinsic nodes.
 *
 * @param {{
 *   registry: {
 *     sqs: Map<string, { logicalId: string, url: string, arn: string, name: string }>,
 *     sns: Map<string, { logicalId: string, arn: string, name: string }>,
 *     s3: Map<string, { logicalId: string, name: string, arn: string }>,
 *     events: Map<string, { logicalId: string, name: string, arn: string }>,
 *     lambda: Map<string, { logicalId: string, arn: string }>,
 *   },
 *   parameters: Record<string, unknown>,
 *   pseudoParams: Record<string, unknown>,
 *   conditions?: Map<string, boolean>,
 *   mappings?: object,
 *   warnings?: Array<{ code: string, reference: string, detail: string }>,
 * }} context
 *   Resolution context supplying the resource registry, pseudo-parameters,
 *   pre-evaluated conditions, template mappings, and a warnings sink.
 *
 * @returns {unknown} The resolved value, deep-equal to the input when no
 *   intrinsics are present.
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
        `Intrinsic "${key}" is not supported in offline mode.`,
        'OFFLINE_UNSUPPORTED_INTRINSIC',
      )
    }
  }

  // Plain object — recurse over each value, dropping keys that resolve to the
  // AWS::NoValue or UNRESOLVED sentinels.
  const result = {}
  for (const [k, v] of Object.entries(value)) {
    const resolved = resolveIntrinsics(v, context)
    if (resolved !== NO_VALUE && resolved !== UNRESOLVED) {
      result[k] = resolved
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

/**
 * Pushes a warning onto the context sink, de-duplicated by `(code, reference)`
 * so the same missing reference is not reported twice. Always returns the
 * `UNRESOLVED` sentinel for ergonomic `return warn(...)` call sites.
 *
 * @param {object} context - The resolution context (provides `warnings`).
 * @param {string} code - Stable warning code.
 * @param {string} reference - Short identifier of the offending node.
 * @param {string} detail - Human-readable explanation.
 * @returns {symbol} The `UNRESOLVED` sentinel.
 */
function warn(context, code, reference, detail) {
  const warnings = context.warnings
  if (Array.isArray(warnings)) {
    const seen = warnings.some(
      (w) => w.code === code && w.reference === reference,
    )
    if (!seen) {
      warnings.push({ code, reference, detail })
    }
  }
  return UNRESOLVED
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a `Ref` against pseudo-parameters, the resource registry, and
 * template parameters. Unknown ids become `UNRESOLVED` plus a warning.
 *
 * @param {string} id - The referenced logical id or pseudo-parameter name.
 * @param {object} context - The resolution context.
 * @returns {unknown} The resolved value, or `UNRESOLVED`.
 */
function resolveRef(id, context) {
  const { pseudoParams, registry, parameters } = context

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

  // S3 buckets — Ref resolves to the bucket name.
  if (registry.s3.has(id)) {
    return registry.s3.get(id).name
  }

  // EventBridge buses and rules — Ref resolves to the resource name.
  if (registry.events.has(id)) {
    return registry.events.get(id).name
  }

  // Lambda functions — Ref resolves to the function ARN.
  if (registry.lambda.has(id)) {
    return registry.lambda.get(id).arn
  }

  // Template parameters — Ref resolves to the (already defaulted) value.
  if (parameters && Object.prototype.hasOwnProperty.call(parameters, id)) {
    return parameters[id]
  }

  return warn(
    context,
    'OFFLINE_UNRESOLVED_REFERENCE',
    id,
    `Cannot resolve { Ref: '${id}' } — no pseudo-parameter, provisioned resource, or template parameter with that name is available offline.`,
  )
}

/**
 * Resolves a `Fn::GetAtt` against the resource registry. Accepts the
 * `[LogicalId, Attribute]` array form or the `"LogicalId.Attribute"` string
 * form (split on the first dot). The attribute may itself be an intrinsic and
 * is resolved first. Unknown logical ids, and known ids with an attribute that
 * is not in the resource type's table, become `UNRESOLVED` plus a warning.
 * Structurally malformed specs throw `OFFLINE_MALFORMED_INTRINSIC`.
 *
 * @param {unknown} spec - The `Fn::GetAtt` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The resolved attribute value, or `UNRESOLVED`.
 */
function resolveGetAtt(spec, context) {
  // Normalise string short-form "LogicalId.Attribute" to array form.
  let logicalId, attribute
  if (typeof spec === 'string') {
    const dot = spec.indexOf('.')
    if (dot === -1) {
      throw new ServerlessError(
        `Fn::GetAtt string form "${spec}" must contain a "." separator.`,
        'OFFLINE_MALFORMED_INTRINSIC',
      )
    }
    logicalId = spec.slice(0, dot)
    attribute = spec.slice(dot + 1)
  } else if (Array.isArray(spec) && spec.length === 2) {
    ;[logicalId, attribute] = spec
  } else {
    throw new ServerlessError(
      `Fn::GetAtt value must be a [LogicalId, Attribute] array or a "LogicalId.Attribute" string.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }

  // The attribute may itself be an intrinsic — resolve it first.
  attribute = resolveIntrinsics(attribute, context)
  if (attribute === UNRESOLVED) return UNRESOLVED

  const { registry } = context
  const reference = `${logicalId}.${attribute}`

  let record
  let table

  if (registry.sqs.has(logicalId)) {
    record = registry.sqs.get(logicalId)
    table = { Arn: record.arn, QueueName: record.name, QueueUrl: record.url }
  } else if (registry.sns.has(logicalId)) {
    record = registry.sns.get(logicalId)
    table = { TopicArn: record.arn, TopicName: record.name }
  } else if (registry.s3.has(logicalId)) {
    record = registry.s3.get(logicalId)
    table = {
      Arn: `arn:aws:s3:::${record.name}`,
      DomainName: s3DomainName(record.name),
      RegionalDomainName: s3RegionalDomainName(record.name),
      WebsiteURL: s3WebsiteUrl(record.name),
    }
  } else if (registry.events.has(logicalId)) {
    record = registry.events.get(logicalId)
    table = { Arn: record.arn, Name: record.name }
  } else if (registry.lambda.has(logicalId)) {
    record = registry.lambda.get(logicalId)
    table = { Arn: record.arn }
  }

  if (!record) {
    return warn(
      context,
      'OFFLINE_UNRESOLVED_REFERENCE',
      reference,
      `Cannot resolve Fn::GetAtt ["${logicalId}", "${attribute}"] — no provisioned resource with logical ID "${logicalId}" is available offline.`,
    )
  }

  if (!Object.prototype.hasOwnProperty.call(table, attribute)) {
    return warn(
      context,
      'OFFLINE_UNRESOLVED_REFERENCE',
      reference,
      `Cannot resolve Fn::GetAtt ["${logicalId}", "${attribute}"] — attribute "${attribute}" is not available for that resource offline.`,
    )
  }

  return table[attribute]
}
