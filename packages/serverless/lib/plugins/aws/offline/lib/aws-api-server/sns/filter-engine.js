/**
 * SNS subscription filter-policy engine.
 *
 * The matching algorithm — flattening, OR-of-ANDs evaluation, the condition
 * operators (exact, exists, anything-but, prefix, suffix, equals-ignore-case,
 * numeric, cidr) and the nested-body / array handling — is a port of
 * `localstack-core/localstack/services/sns/filter.py` from the LocalStack
 * project (Apache-2.0). The Python class methods map to the functions below:
 * `check_filter_policy_on_message_attributes`, `check_filter_policy_on_message_body`,
 * `_evaluate_nested_filter_policy_on_dict`, `_evaluate_filter_policy_conditions_on_attribute`,
 * `_evaluate_condition`, `_evaluate_numeric_condition`, `flatten_policy`, `flatten_payload`.
 *
 * Semantics mirror real AWS SNS message filtering: a policy is an OR over the
 * flattened condition sets; within a set every field must match (AND); within a
 * single field's condition list any condition may match (OR). An empty or absent
 * policy matches everything.
 */

import net from 'node:net'

/**
 * Evaluate a filter policy against a message.
 *
 * @param {object|null|undefined} filterPolicy
 * @param {{
 *   messageAttributes?: object,
 *   messageBody?: string,
 *   scope?: 'MessageAttributes' | 'MessageBody',
 * }} message
 * @returns {boolean}
 */
export function matchesFilterPolicy(filterPolicy, message = {}) {
  const {
    messageAttributes,
    messageBody,
    scope = 'MessageAttributes',
  } = message

  if (scope === 'MessageBody') {
    return checkFilterPolicyOnMessageBody(filterPolicy, messageBody)
  }

  return checkFilterPolicyOnMessageAttributes(
    filterPolicy,
    messageAttributes ?? {},
  )
}

/**
 * Port of `check_filter_policy_on_message_attributes`.
 *
 * @param {object} filterPolicy
 * @param {object} messageAttributes
 * @returns {boolean}
 */
function checkFilterPolicyOnMessageAttributes(filterPolicy, messageAttributes) {
  if (isEmptyPolicy(filterPolicy)) return true

  const flatPolicyConditions = flattenPolicy(filterPolicy)

  return flatPolicyConditions.some((flatPolicy) =>
    Object.entries(flatPolicy).every(([criteria, conditions]) =>
      evaluateFilterPolicyConditionsOnAttribute(
        conditions,
        messageAttributes[criteria],
        criteria in messageAttributes,
      ),
    ),
  )
}

/**
 * Port of `check_filter_policy_on_message_body`. Filter policies for the body
 * assume the payload is a well-formed JSON object; anything else never matches.
 *
 * @param {object} filterPolicy
 * @param {string} messageBody
 * @returns {boolean}
 */
function checkFilterPolicyOnMessageBody(filterPolicy, messageBody) {
  let body
  try {
    body = JSON.parse(messageBody)
  } catch {
    return false
  }
  if (!isPlainObject(body)) return false

  return evaluateNestedFilterPolicyOnDict(filterPolicy, body)
}

/**
 * Port of `_evaluate_nested_filter_policy_on_dict`.
 *
 * @param {object} filterPolicy
 * @param {object} payload
 * @returns {boolean}
 */
function evaluateNestedFilterPolicyOnDict(filterPolicy, payload) {
  if (isEmptyPolicy(filterPolicy)) return true

  const flatPolicyConditions = flattenPolicy(filterPolicy)
  const flatPayloads = flattenPayload(payload, flatPolicyConditions)

  return flatPolicyConditions.some((flatPolicy) =>
    Object.entries(flatPolicy).every(([key, conditions]) => {
      const conditionList = Array.isArray(conditions)
        ? conditions
        : [conditions]
      return conditionList.some((condition) =>
        flatPayloads.some((flatPayload) =>
          evaluateCondition(flatPayload[key], condition, key in flatPayload),
        ),
      )
    }),
  )
}

/**
 * Port of `_evaluate_filter_policy_conditions_on_attribute`. Extracts the
 * comparable value from an SNS message-attribute entry (`{ DataType|Type,
 * StringValue|Value }`). `String.Array` values are JSON-parsed and each element
 * is tested; Binary attributes carry no string value, so only `{ exists }`
 * conditions can match them.
 *
 * @param {object|object[]} conditions
 * @param {object|undefined} attribute
 * @param {boolean} fieldExists
 * @returns {boolean}
 */
function evaluateFilterPolicyConditionsOnAttribute(
  conditions,
  attribute,
  fieldExists,
) {
  const conditionList = Array.isArray(conditions) ? conditions : [conditions]

  const type = attribute ? (attribute.DataType ?? attribute.Type) : null
  const val = attribute ? (attribute.StringValue ?? attribute.Value) : null

  if (attribute != null && type === 'String.Array') {
    let values
    try {
      values = JSON.parse(val)
    } catch {
      return false
    }
    for (const value of values) {
      for (const condition of conditionList) {
        if (evaluateCondition(value, condition, fieldExists)) return true
      }
    }
    return false
  }

  for (const condition of conditionList) {
    // Mirror Python's `value = val or None`: an empty string collapses to null.
    const value = val || null
    if (evaluateCondition(value, condition, fieldExists)) return true
  }

  return false
}

/**
 * Port of `_evaluate_condition`. Evaluates a single condition against a value.
 *
 * @param {*} value
 * @param {*} condition
 * @param {boolean} fieldExists
 * @returns {boolean}
 */
function evaluateCondition(value, condition, fieldExists) {
  if (!isPlainObject(condition)) {
    // Typed equality, mirroring Python `==`: '100' !== 100, 100 === 100.
    return fieldExists && value === condition
  }

  const mustExist = condition.exists
  if (mustExist != null) {
    return mustExist === fieldExists
  }

  if (value == null) {
    // The remaining operators all require a concrete value.
    return false
  }

  const anythingBut = condition['anything-but']
  if (anythingBut) {
    return evaluateAnythingBut(anythingBut, value)
  }

  const prefix = condition.prefix
  if (prefix) {
    return String(value).startsWith(prefix)
  }

  const suffix = condition.suffix
  if (suffix) {
    return String(value).endsWith(suffix)
  }

  const equalsIgnoreCase = condition['equals-ignore-case']
  if (equalsIgnoreCase) {
    return equalsIgnoreCase.toLowerCase() === String(value).toLowerCase()
  }

  const numericCondition = condition.numeric
  if (numericCondition) {
    return evaluateNumericCondition(numericCondition, value)
  }

  const cidr = condition.cidr
  if (cidr) {
    return cidrContains(cidr, value)
  }

  return false
}

/**
 * Evaluate an `anything-but` operand against a concrete value. The operand is
 * one of: a scalar (matches anything but that value), a list (matches anything
 * not in the list), or an operator object — `{ prefix }`, `{ suffix }`, or
 * `{ equals-ignore-case }` (scalar or list) — each negated so the condition
 * holds when the value does NOT satisfy the wrapped operator. Any unrecognised
 * operator object yields no match, mirroring real AWS SNS rather than letting
 * an unsupported shape through as a spurious match.
 *
 * @param {*} anythingBut
 * @param {*} value
 * @returns {boolean}
 */
function evaluateAnythingBut(anythingBut, value) {
  if (isPlainObject(anythingBut)) {
    const notPrefix = anythingBut.prefix
    if (notPrefix != null) {
      return !String(value).startsWith(notPrefix)
    }

    const notSuffix = anythingBut.suffix
    if (notSuffix != null) {
      return !String(value).endsWith(notSuffix)
    }

    const notEqualsIgnoreCase = anythingBut['equals-ignore-case']
    if (notEqualsIgnoreCase != null) {
      const candidates = Array.isArray(notEqualsIgnoreCase)
        ? notEqualsIgnoreCase
        : [notEqualsIgnoreCase]
      const lowered = String(value).toLowerCase()
      return !candidates.some(
        (entry) => String(entry).toLowerCase() === lowered,
      )
    }

    // An unrecognised operator object never matches.
    return false
  }

  if (Array.isArray(anythingBut)) {
    return !anythingBut.includes(value)
  }

  return value !== anythingBut
}

/**
 * Port of `_evaluate_numeric_condition`. Supports a single `[op, n]` and a range
 * `[op1, n1, op2, n2]`. Operators: `<`, `<=`, `=`, `>=`, `>`.
 *
 * @param {Array} conditions
 * @param {*} rawValue
 * @returns {boolean}
 */
function evaluateNumericCondition(conditions, rawValue) {
  const value = Number(rawValue)
  // Mirror Python `float(value)` raising on non-numerics (empty string → NaN too).
  if (Number.isNaN(value) || rawValue === '' || rawValue == null) return false

  for (let i = 0; i < conditions.length; i += 2) {
    const operator = conditions[i]
    const operand = Number(conditions[i + 1])

    if (operator === '=') {
      if (value !== operand) return false
    } else if (operator === '>') {
      if (value <= operand) return false
    } else if (operator === '<') {
      if (value >= operand) return false
    } else if (operator === '>=') {
      if (value < operand) return false
    } else if (operator === '<=') {
      if (value > operand) return false
    }
  }

  return true
}

/**
 * Port of `flatten_policy`. Flattens a (possibly nested) policy to a single
 * level. `$or` (a list with more than one entry) multiplies the current
 * branches, yielding one output dict per alternative.
 *
 * @param {object} nestedDict
 * @returns {object[]}
 */
export function flattenPolicy(nestedDict) {
  function traverse(obj, array = [{}], parentKey = null) {
    let acc = array
    for (const [key, values] of Object.entries(obj)) {
      if (key === '$or' && Array.isArray(values) && values.length > 1) {
        acc = values.flatMap((value) => traverse(value, acc, parentKey))
      } else {
        const nextKey = parentKey ? `${parentKey}.${key}` : key
        if (isPlainObject(values)) {
          acc = traverse(values, acc, nextKey)
        } else {
          acc = acc.map((item) => ({ ...item, [nextKey]: values }))
        }
      }
    }
    return acc
  }

  return traverse(nestedDict)
}

/**
 * Port of `flatten_payload`. Flattens the JSON payload to single-level dicts,
 * expanding arrays into one branch per element, but only building the parts of
 * the payload relevant to the policy keys.
 *
 * @param {object} payload
 * @param {object[]} policyConditions
 * @returns {object[]}
 */
export function flattenPayload(payload, policyConditions) {
  const policyKeys = new Set()
  for (const conditions of policyConditions) {
    for (const key of Object.keys(conditions)) policyKeys.add(key)
  }

  function isKeyInPolicy(key) {
    if (key == null) return true
    for (const policyKey of policyKeys) {
      if (policyKey.startsWith(key)) return true
    }
    return false
  }

  function traverse(object, array = [{}], parentKey = null) {
    let acc = array
    if (isPlainObject(object)) {
      for (const [key, values] of Object.entries(object)) {
        const nextKey = parentKey ? `${parentKey}.${key}` : key
        if (isKeyInPolicy(nextKey)) {
          acc = traverse(values, acc, nextKey)
        }
      }
    } else if (Array.isArray(object)) {
      if (object.length === 0) return acc
      acc = object.flatMap((value) => traverse(value, acc, parentKey))
    } else {
      acc = acc.map((item) => ({ ...item, [parentKey]: object }))
    }
    return acc
  }

  return traverse(payload, [{}], null)
}

/**
 * Whether `value` is a plain object (not null, not an array).
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a policy is empty (null/undefined or an object with no keys).
 *
 * @param {*} policy
 * @returns {boolean}
 */
function isEmptyPolicy(policy) {
  return policy == null || Object.keys(policy).length === 0
}

/**
 * IPv4/IPv6 CIDR membership test, replacing Python's `ipaddress` module.
 * Returns false for any malformed IP or CIDR (mirroring the port's
 * `except ValueError: return False`).
 *
 * @param {string} cidr - e.g. `10.0.0.0/24` or `2001:db8::/32`.
 * @param {*} value - the candidate IP address.
 * @returns {boolean}
 */
function cidrContains(cidr, value) {
  const ip = String(value)
  const slash = cidr.lastIndexOf('/')
  if (slash === -1) return false

  const network = cidr.slice(0, slash)
  const prefixLength = Number(cidr.slice(slash + 1))
  if (!Number.isInteger(prefixLength) || prefixLength < 0) return false

  const ipVersion = net.isIP(ip)
  const networkVersion = net.isIP(network)
  if (ipVersion === 0 || networkVersion === 0 || ipVersion !== networkVersion) {
    return false
  }

  const bits = ipVersion === 4 ? 32 : 128
  if (prefixLength > bits) return false

  const ipInt = ipToBigInt(ip, ipVersion)
  const networkInt = ipToBigInt(network, networkVersion)
  if (ipInt === null || networkInt === null) return false

  if (prefixLength === 0) return true
  const mask =
    (~0n << BigInt(bits - prefixLength)) & ((1n << BigInt(bits)) - 1n)
  return (ipInt & mask) === (networkInt & mask)
}

/**
 * Convert an IPv4 or IPv6 address to a BigInt. Returns null when the address
 * cannot be parsed.
 *
 * @param {string} ip
 * @param {4 | 6} version
 * @returns {bigint|null}
 */
function ipToBigInt(ip, version) {
  if (version === 4) {
    const octets = ip.split('.')
    if (octets.length !== 4) return null
    let result = 0n
    for (const octet of octets) {
      const n = Number(octet)
      if (!Number.isInteger(n) || n < 0 || n > 255) return null
      result = (result << 8n) | BigInt(n)
    }
    return result
  }

  return ipv6ToBigInt(ip)
}

/**
 * Convert an IPv6 address (including `::` compression) to a BigInt. Returns null
 * on malformed input.
 *
 * @param {string} ip
 * @returns {bigint|null}
 */
function ipv6ToBigInt(ip) {
  // Split on `::` (at most one allowed) into head and tail hextet groups.
  const halves = ip.split('::')
  if (halves.length > 2) return null

  const headParts = halves[0] === '' ? [] : halves[0].split(':')
  const tailParts =
    halves.length === 2 ? (halves[1] === '' ? [] : halves[1].split(':')) : null

  let groups
  if (tailParts === null) {
    groups = headParts
    if (groups.length !== 8) return null
  } else {
    const missing = 8 - (headParts.length + tailParts.length)
    if (missing < 1) return null
    groups = [...headParts, ...Array(missing).fill('0'), ...tailParts]
  }

  let result = 0n
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    result = (result << 16n) | BigInt(parseInt(group, 16))
  }
  return result
}
