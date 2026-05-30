import ServerlessError from '../../../../../serverless-error.js'

/**
 * Evaluates a CloudFormation template's `Conditions` block to a map of
 * `name → boolean`, so the resource walker can skip resources whose condition
 * is false and the intrinsic resolver can satisfy `Fn::If`.
 *
 * Supported condition functions: `Fn::Equals`, `Fn::And`, `Fn::Or`, `Fn::Not`,
 * and `{ Condition: <name> }` references (evaluated lazily with a cycle guard).
 * Operands are resolved with a lightweight scalar resolver covering `Ref`
 * (pseudo-parameters and template parameters only — conditions cannot reference
 * resources in CloudFormation) and `Fn::FindInMap`. An unknown `Ref` inside a
 * condition resolves to `undefined`, so an `Fn::Equals` against it is simply
 * false rather than a hard error.
 *
 * @param {{ Conditions?: Record<string, unknown> }} template
 *   The compiled CloudFormation template (only its `Conditions` block is read).
 * @param {{
 *   parameters: Record<string, unknown>,
 *   pseudoParams: Record<string, unknown>,
 *   mappings?: object,
 * }} context
 *   Resolution context for condition operands.
 * @returns {Map<string, boolean>} The evaluated conditions.
 * @throws {ServerlessError} OFFLINE_MALFORMED_INTRINSIC — a circular condition
 *   reference, a reference to an undefined condition, or a structurally
 *   malformed condition expression.
 */
export function evaluateConditions(template, context) {
  const block =
    template && typeof template.Conditions === 'object' && template.Conditions
      ? template.Conditions
      : {}

  const result = new Map()
  const inProgress = new Set()

  function evalCondition(name) {
    if (result.has(name)) return result.get(name)
    if (inProgress.has(name)) {
      throw new ServerlessError(
        `Condition "${name}" has a circular reference.`,
        'OFFLINE_MALFORMED_INTRINSIC',
      )
    }
    if (!Object.prototype.hasOwnProperty.call(block, name)) {
      throw new ServerlessError(
        `Condition "${name}" is referenced but not defined in the template Conditions block.`,
        'OFFLINE_MALFORMED_INTRINSIC',
      )
    }
    inProgress.add(name)
    const value = evalExpr(block[name])
    inProgress.delete(name)
    result.set(name, value)
    return value
  }

  function evalExpr(expr) {
    if (typeof expr === 'boolean') return expr
    if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) {
      throw new ServerlessError(
        'Malformed condition expression: expected an intrinsic object.',
        'OFFLINE_MALFORMED_INTRINSIC',
      )
    }
    const keys = Object.keys(expr)
    if (keys.length !== 1) {
      throw new ServerlessError(
        'Malformed condition expression: expected a single intrinsic key.',
        'OFFLINE_MALFORMED_INTRINSIC',
      )
    }
    const key = keys[0]
    const arg = expr[key]

    switch (key) {
      case 'Condition':
        return evalCondition(arg)
      case 'Fn::Equals': {
        if (!Array.isArray(arg) || arg.length !== 2) {
          throw new ServerlessError(
            'Fn::Equals expects a two-element array.',
            'OFFLINE_MALFORMED_INTRINSIC',
          )
        }
        return deepEqual(
          resolveScalar(arg[0], context),
          resolveScalar(arg[1], context),
        )
      }
      case 'Fn::And':
        return asList(arg, 'Fn::And').every((sub) => evalExpr(sub))
      case 'Fn::Or':
        return asList(arg, 'Fn::Or').some((sub) => evalExpr(sub))
      case 'Fn::Not':
        return !evalExpr(asList(arg, 'Fn::Not')[0])
      default:
        throw new ServerlessError(
          `Unsupported condition function "${key}".`,
          'OFFLINE_MALFORMED_INTRINSIC',
        )
    }
  }

  for (const name of Object.keys(block)) {
    evalCondition(name)
  }
  return result
}

/**
 * Resolves a condition operand. Handles `Ref` (pseudo-parameters and template
 * parameters only) and `Fn::FindInMap`; literals pass through. Deliberately
 * narrower than the full resource resolver to avoid a circular dependency and
 * because conditions cannot reference resources.
 *
 * @param {unknown} value - The operand.
 * @param {object} context - The resolution context.
 * @returns {unknown} The resolved scalar, or `undefined` for an unknown `Ref`.
 */
function resolveScalar(value, context) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => resolveScalar(item, context))
  }
  const keys = Object.keys(value)
  if (keys.length === 1) {
    const key = keys[0]
    if (key === 'Ref') {
      const id = value.Ref
      if (Object.prototype.hasOwnProperty.call(context.pseudoParams, id)) {
        return context.pseudoParams[id]
      }
      if (
        context.parameters &&
        Object.prototype.hasOwnProperty.call(context.parameters, id)
      ) {
        return context.parameters[id]
      }
      return undefined
    }
    if (key === 'Fn::FindInMap') {
      const spec = value['Fn::FindInMap']
      if (!Array.isArray(spec) || spec.length !== 3) {
        throw new ServerlessError(
          'Fn::FindInMap expects a three-element array.',
          'OFFLINE_MALFORMED_INTRINSIC',
        )
      }
      const [mapName, topKey, secondKey] = spec.map((part) =>
        resolveScalar(part, context),
      )
      const mappings = context.mappings ?? {}
      return mappings?.[mapName]?.[topKey]?.[secondKey]
    }
  }
  return value
}

/**
 * Structural equality for condition operands. Scalars compare by value;
 * objects/arrays compare by canonical JSON.
 */
function deepEqual(a, b) {
  if (a === b) return true
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Asserts that a condition-function argument is an array, throwing
 * `OFFLINE_MALFORMED_INTRINSIC` otherwise.
 */
function asList(arg, fn) {
  if (!Array.isArray(arg)) {
    throw new ServerlessError(
      `${fn} expects an array argument.`,
      'OFFLINE_MALFORMED_INTRINSIC',
    )
  }
  return arg
}
