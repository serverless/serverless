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
 * Supports `Ref`, `Fn::GetAtt`, `Fn::Sub` (string and map forms), `Fn::Join`,
 * `Fn::Select`, `Fn::Split`, `Fn::FindInMap`, `Fn::If`, and `Fn::ImportValue`,
 * matching the AWS-documented return-value semantics for each provisioned
 * resource type.
 *
 * Failure modes:
 * - A reference that cannot be resolved (unknown `Ref`/`Fn::GetAtt` target,
 *   missing `Fn::FindInMap` path, any unimplemented `Fn::*`) becomes the
 *   `UNRESOLVED` sentinel and a warning is pushed onto `context.warnings`
 *   rather than throwing, so booting offline never crashes on a missing
 *   reference. `Fn::ImportValue` is always `UNRESOLVED` with a cross-stack
 *   warning because exports do not exist offline.
 * - `UNRESOLVED` propagates: a container intrinsic whose required input is
 *   `UNRESOLVED` becomes `UNRESOLVED`; an `UNRESOLVED` array element makes the
 *   whole array `UNRESOLVED`; an `UNRESOLVED` plain-object value drops that
 *   key. `AWS::NoValue` likewise drops object keys and array elements.
 * - Only structural faults throw `OFFLINE_MALFORMED_INTRINSIC`: a `Fn::GetAtt`
 *   that is neither a 2-element array nor a dotted string, a `Fn::Select`
 *   index out of range against a resolved array, a `Fn::If` referencing an
 *   unknown condition, and similar wrong-arity specs. A `Fn::Select` whose list
 *   operand resolves to a non-array value (e.g. a CommaDelimitedList parameter
 *   that resolves to a string) is a valid template and degrades to `UNRESOLVED`
 *   plus a warning instead of throwing.
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
 *     lambda: Map<string, { logicalId: string, name: string, arn: string }>,
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
 *
 * @throws {ServerlessError} OFFLINE_MALFORMED_INTRINSIC — a structurally
 *   malformed intrinsic node (wrong arity/shape, out-of-range index, or an
 *   unknown `Fn::If` condition).
 */
export function resolveIntrinsics(value, context) {
  // Primitives — return as-is (bare strings that look like pseudo-param keys
  // are NOT substituted; only { Ref: 'AWS::Region' } triggers substitution).
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  // Arrays — recurse over each element. An UNRESOLVED element makes the whole
  // array UNRESOLVED (it bubbles up to the nearest object key / consumer); an
  // AWS::NoValue element is dropped, matching how CloudFormation treats
  // AWS::NoValue in lists.
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) {
      const resolved = resolveIntrinsics(item, context)
      if (resolved === UNRESOLVED) return UNRESOLVED
      if (resolved === NO_VALUE) continue
      out.push(resolved)
    }
    return out
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

    if (key === 'Fn::Sub') {
      return resolveSub(value['Fn::Sub'], context)
    }

    if (key === 'Fn::Join') {
      return resolveJoin(value['Fn::Join'], context)
    }

    if (key === 'Fn::Select') {
      return resolveSelect(value['Fn::Select'], context)
    }

    if (key === 'Fn::Split') {
      return resolveSplit(value['Fn::Split'], context)
    }

    if (key === 'Fn::FindInMap') {
      return resolveFindInMap(value['Fn::FindInMap'], context)
    }

    if (key === 'Fn::If') {
      return resolveIf(value['Fn::If'], context)
    }

    if (key === 'Fn::ImportValue') {
      return resolveImportValue(value['Fn::ImportValue'], context)
    }

    if (key.startsWith('Fn::')) {
      // Forward-compatible: any intrinsic we do not implement locally is
      // dropped with a warning rather than crashing boot.
      return warn(
        context,
        'OFFLINE_UNRESOLVED_REFERENCE',
        key,
        `Intrinsic "${key}" is not resolved offline; the value referencing it is dropped.`,
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

  // Lambda functions — Ref resolves to the function name; only
  // Fn::GetAtt …Arn returns the ARN.
  if (registry.lambda.has(id)) {
    return registry.lambda.get(id).name
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

/**
 * Resolves a single `${...}` token from an `Fn::Sub` template. Supplied
 * variables take precedence; otherwise a token containing a dot is resolved
 * with `Fn::GetAtt` semantics and a bare token with `Ref` semantics (which
 * covers both pseudo-parameters and logical ids).
 *
 * @param {string} token - The inner text of a `${...}` placeholder.
 * @param {Record<string, unknown>} vars - Resolved supplied variables.
 * @param {object} context - The resolution context.
 * @returns {unknown} The substitution value, or `UNRESOLVED`.
 */
function resolveSubToken(token, vars, context) {
  if (Object.prototype.hasOwnProperty.call(vars, token)) {
    return vars[token]
  }
  if (token.includes('.')) {
    return resolveGetAtt(token, context)
  }
  return resolveRef(token, context)
}

/**
 * Resolves `Fn::Sub` in both its string and map forms.
 *
 * String form: `${AWS::X}`, `${LogicalId}`, and `${LogicalId.Attr}` are
 * substituted; `${!Literal}` escapes to a literal `${Literal}`. Map form
 * `[template, vars]` resolves each supplied variable first (variables take
 * precedence in substitution). If any required component is `UNRESOLVED`, the
 * whole `Fn::Sub` becomes `UNRESOLVED` plus a warning.
 *
 * @param {unknown} spec - The `Fn::Sub` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The substituted string, or `UNRESOLVED`.
 */
function resolveSub(spec, context) {
  let template
  let vars = {}

  if (typeof spec === 'string') {
    template = spec
  } else if (Array.isArray(spec) && spec.length === 2) {
    template = spec[0]
    const rawVars = spec[1] ?? {}
    for (const [name, rawValue] of Object.entries(rawVars)) {
      const resolved = resolveIntrinsics(rawValue, context)
      if (resolved === UNRESOLVED) return UNRESOLVED
      vars[name] = resolved
    }
  } else {
    throw new ServerlessError(
      `Fn::Sub value must be a template string or a [template, variables] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }

  let unresolved = false
  // `${!X}` escapes to a literal `${X}`; `${X}` substitutes.
  const result = template.replace(/\$\{(!?[^}]+)\}/g, (match, inner) => {
    if (inner.startsWith('!')) {
      return `\${${inner.slice(1)}}`
    }
    const value = resolveSubToken(inner.trim(), vars, context)
    if (value === UNRESOLVED) {
      unresolved = true
      return match
    }
    return String(value)
  })

  return unresolved ? UNRESOLVED : result
}

/**
 * Resolves `Fn::Join` `[delimiter, list]` by resolving the list and joining its
 * members. An `UNRESOLVED` member makes the whole result `UNRESOLVED`.
 *
 * @param {unknown} spec - The `Fn::Join` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The joined string, or `UNRESOLVED`.
 */
function resolveJoin(spec, context) {
  if (!Array.isArray(spec) || spec.length !== 2) {
    throw new ServerlessError(
      `Fn::Join value must be a [delimiter, list] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const [delimiter, rawList] = spec
  const list = resolveIntrinsics(rawList, context)
  if (list === UNRESOLVED || !Array.isArray(list)) return UNRESOLVED
  return list.join(delimiter)
}

/**
 * Resolves `Fn::Select` `[index, list]`.
 *
 * The spec itself must be a 2-element array, otherwise it is structurally
 * malformed and throws `OFFLINE_MALFORMED_INTRINSIC`. If the list resolves to a
 * value that is not an array — e.g. a `CommaDelimitedList` parameter that
 * resolves to a plain string — that is a valid template offline, so the result
 * degrades to a warning plus `UNRESOLVED` rather than crashing boot. An
 * `UNRESOLVED` list or index likewise yields `UNRESOLVED`. Only a genuinely
 * malformed select — an out-of-range or non-integer index against a resolved
 * array — throws `OFFLINE_MALFORMED_INTRINSIC`.
 *
 * @param {unknown} spec - The `Fn::Select` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The selected element, or `UNRESOLVED`.
 */
function resolveSelect(spec, context) {
  if (!Array.isArray(spec) || spec.length !== 2) {
    throw new ServerlessError(
      `Fn::Select value must be an [index, list] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const rawIndex = resolveIntrinsics(spec[0], context)
  const list = resolveIntrinsics(spec[1], context)
  if (rawIndex === UNRESOLVED || list === UNRESOLVED) return UNRESOLVED
  if (!Array.isArray(list)) {
    return warn(
      context,
      'OFFLINE_UNRESOLVED_REFERENCE',
      'Fn::Select',
      `Cannot resolve Fn::Select — the list operand resolved to a non-array value offline; the value referencing it is dropped.`,
    )
  }
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    throw new ServerlessError(
      `Fn::Select index ${index} is out of range for the resolved list.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  return list[index]
}

/**
 * Resolves `Fn::Split` `[delimiter, string]` by splitting the resolved string.
 *
 * @param {unknown} spec - The `Fn::Split` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The array of segments, or `UNRESOLVED` if the source is.
 */
function resolveSplit(spec, context) {
  if (!Array.isArray(spec) || spec.length !== 2) {
    throw new ServerlessError(
      `Fn::Split value must be a [delimiter, string] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const delimiter = spec[0]
  const source = resolveIntrinsics(spec[1], context)
  if (source === UNRESOLVED) return UNRESOLVED
  return String(source).split(delimiter)
}

/**
 * Resolves `Fn::FindInMap` `[MapName, TopKey, SecondKey]` against the template
 * mappings. A missing path becomes `UNRESOLVED` plus a warning.
 *
 * @param {unknown} spec - The `Fn::FindInMap` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The mapped value, or `UNRESOLVED`.
 */
function resolveFindInMap(spec, context) {
  if (!Array.isArray(spec) || spec.length !== 3) {
    throw new ServerlessError(
      `Fn::FindInMap value must be a [MapName, TopLevelKey, SecondLevelKey] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const mapName = resolveIntrinsics(spec[0], context)
  const topKey = resolveIntrinsics(spec[1], context)
  const secondKey = resolveIntrinsics(spec[2], context)
  const reference = `${mapName}.${topKey}.${secondKey}`

  if (
    mapName === UNRESOLVED ||
    topKey === UNRESOLVED ||
    secondKey === UNRESOLVED
  ) {
    return UNRESOLVED
  }

  const mappings = context.mappings ?? {}
  const found = mappings?.[mapName]?.[topKey]?.[secondKey]
  if (found === undefined) {
    return warn(
      context,
      'OFFLINE_UNRESOLVED_REFERENCE',
      reference,
      `Cannot resolve Fn::FindInMap [${reference}] — that path does not exist in the template mappings.`,
    )
  }
  return found
}

/**
 * Resolves `Fn::If` `[conditionName, valueIfTrue, valueIfFalse]` by looking up
 * the pre-evaluated condition and resolving the chosen branch. An unknown
 * condition name throws `OFFLINE_MALFORMED_INTRINSIC`.
 *
 * @param {unknown} spec - The `Fn::If` value.
 * @param {object} context - The resolution context.
 * @returns {unknown} The resolved chosen branch.
 */
function resolveIf(spec, context) {
  if (!Array.isArray(spec) || spec.length !== 3) {
    throw new ServerlessError(
      `Fn::If value must be a [ConditionName, ValueIfTrue, ValueIfFalse] array.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const [conditionName, valueIfTrue, valueIfFalse] = spec
  const conditions = context.conditions
  if (!conditions || !conditions.has(conditionName)) {
    throw new ServerlessError(
      `Fn::If references unknown condition "${conditionName}".`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  const chosen = conditions.get(conditionName) ? valueIfTrue : valueIfFalse
  return resolveIntrinsics(chosen, context)
}

/**
 * Handles `Fn::ImportValue`. Cross-stack exports cannot exist offline, so the
 * value is always `UNRESOLVED` with a cross-stack warning. The import name is
 * resolved first (it may itself be an intrinsic) so the warning carries a
 * meaningful reference.
 *
 * @param {unknown} spec - The `Fn::ImportValue` value.
 * @param {object} context - The resolution context.
 * @returns {symbol} The `UNRESOLVED` sentinel.
 */
function resolveImportValue(spec, context) {
  const name = resolveIntrinsics(spec, context)
  const reference = name === UNRESOLVED ? '<unresolved>' : String(name)
  return warn(
    context,
    'OFFLINE_CROSS_STACK_REFERENCE',
    reference,
    `Cannot resolve Fn::ImportValue "${reference}" offline — cross-stack exports are not available; the value referencing it is dropped.`,
  )
}
