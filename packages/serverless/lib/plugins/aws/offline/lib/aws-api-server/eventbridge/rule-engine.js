/**
 * EventBridge event-pattern matcher.
 *
 * The matching algorithm — pattern/payload flattening, the OR-of-ANDs
 * evaluation, `$or` branching and the condition operators (exact, exists,
 * anything-but, prefix, suffix, equals-ignore-case, numeric, cidr, wildcard) —
 * is a port of `localstack-core/localstack/services/events/event_rule_engine.py`
 * from the LocalStack project (Apache-2.0). The Python `EventRuleEngine` methods
 * map to the functions below: `evaluate_pattern_on_event`,
 * `_evaluate_nested_event_pattern_on_dict`, `_evaluate_condition`,
 * `_evaluate_prefix`, `_evaluate_suffix`, `_evaluate_equal_ignore_case`,
 * `_evaluate_cidr`, `_evaluate_wildcard`, `_evaluate_numeric_condition`,
 * `flatten_pattern`, `flatten_payload`.
 *
 * Semantics mirror real AWS EventBridge event-pattern matching: top-level
 * pattern keys are matched against the event's same-named fields, the `detail`
 * key against the event's nested `detail` object (recursively); a pattern value
 * is a list of allowed values / condition objects (OR within a field); every
 * specified top-level key must match (AND across keys); `$or` at any level is an
 * OR across the listed sub-patterns. An empty or absent pattern matches
 * everything.
 */

import net from 'node:net'

/**
 * Evaluate an event pattern against an event.
 *
 * Both arguments may be plain objects or JSON strings. An event that is not a
 * well-formed JSON object never matches (mirroring the port).
 *
 * @param {object|string|null|undefined} eventPattern
 * @param {object|string} event
 * @returns {boolean}
 */
export function matchesEventPattern(eventPattern, event) {
  const pattern =
    typeof eventPattern === 'string' ? tryParseJson(eventPattern) : eventPattern

  if (isEmptyPattern(pattern)) return true
  if (!isPlainObject(pattern)) return false

  let body
  if (typeof event === 'string') {
    body = tryParseJson(event)
    if (!isPlainObject(body)) return false
  } else {
    body = event
  }
  if (!isPlainObject(body)) return false

  return evaluateNestedEventPatternOnDict(pattern, body)
}

/**
 * Port of `_evaluate_nested_event_pattern_on_dict`. Flattens both the pattern
 * (one branch per `$or` alternative) and the payload (one branch per array
 * element), then evaluates the OR-of-ANDs: the event matches if ANY flattened
 * pattern branch is satisfied, where every key in that branch must match (AND)
 * and a key matches if ANY of its conditions holds against ANY flattened
 * payload branch (OR).
 *
 * @param {object} eventPattern
 * @param {object} payload
 * @returns {boolean}
 */
function evaluateNestedEventPatternOnDict(eventPattern, payload) {
  if (isEmptyPattern(eventPattern)) return true

  const flatPatternConditions = flattenPattern(eventPattern)
  const flatPayloads = flattenPayload(payload, flatPatternConditions)

  return flatPatternConditions.some((flatPattern) =>
    Object.entries(flatPattern).every(([key, conditions]) => {
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
 * Port of `_evaluate_condition`. Evaluates a single condition against a value.
 *
 * @param {*} value
 * @param {*} condition
 * @param {boolean} fieldExists
 * @returns {boolean}
 */
function evaluateCondition(value, condition, fieldExists) {
  if (!isPlainObject(condition)) {
    // Typed equality, mirroring Python `==`: '42' !== 42, true !== 1.
    return fieldExists && value === condition
  }

  const mustExist = condition.exists
  if (mustExist != null) {
    // exists:true requires the field to be present; exists:false, absent.
    return mustExist === fieldExists
  }

  const anythingBut = condition['anything-but']
  if (anythingBut != null) {
    // anything-but can handle a `null` value, but it must distinguish a
    // user-set null from a missing field: a missing field never matches.
    if (!fieldExists) return false
    return evaluateAnythingBut(anythingBut, value)
  }

  if (value == null) {
    // The remaining operators all require a concrete (non-null) value.
    return false
  }

  const prefix = condition.prefix
  if (prefix != null) {
    if (isPlainObject(prefix)) {
      const prefixEqualIgnoreCase = prefix['equals-ignore-case']
      if (prefixEqualIgnoreCase != null) {
        return evaluatePrefix(
          String(prefixEqualIgnoreCase).toLowerCase(),
          String(value).toLowerCase(),
        )
      }
      return false
    }
    return evaluatePrefix(prefix, value)
  }

  const suffix = condition.suffix
  if (suffix != null) {
    if (isPlainObject(suffix)) {
      const suffixEqualIgnoreCase = suffix['equals-ignore-case']
      if (suffixEqualIgnoreCase != null) {
        return evaluateSuffix(
          String(suffixEqualIgnoreCase).toLowerCase(),
          String(value).toLowerCase(),
        )
      }
      return false
    }
    return evaluateSuffix(suffix, value)
  }

  const equalIgnoreCase = condition['equals-ignore-case']
  if (equalIgnoreCase != null) {
    return evaluateEqualIgnoreCase(equalIgnoreCase, value)
  }

  // A `numeric` operand is validated to be a non-empty list on rule creation.
  const numericCondition = condition.numeric
  if (numericCondition) {
    return evaluateNumericCondition(numericCondition, value)
  }

  // A `cidr` operand is validated to be non-empty on rule creation.
  const cidr = condition.cidr
  if (cidr) {
    return evaluateCidr(cidr, value)
  }

  const wildcard = condition.wildcard
  if (wildcard != null) {
    return evaluateWildcard(wildcard, value)
  }

  return false
}

/**
 * Evaluate an `anything-but` operand against a concrete value (the field is
 * known to be present). The operand is one of: a scalar (matches anything but
 * that value), a list (matches anything not in the list), or an operator
 * object — `{ prefix }`, `{ suffix }`, `{ equals-ignore-case }` or
 * `{ wildcard }` — whose operand may itself be a string or a list of strings,
 * negated so the condition holds when the value satisfies NONE of them. An
 * unrecognised operator object never matches, mirroring the port.
 *
 * @param {*} anythingBut
 * @param {*} value
 * @returns {boolean}
 */
function evaluateAnythingBut(anythingBut, value) {
  if (isPlainObject(anythingBut)) {
    let notCondition
    let predicate

    if (anythingBut.prefix != null) {
      notCondition = anythingBut.prefix
      predicate = evaluatePrefix
    } else if (anythingBut.suffix != null) {
      notCondition = anythingBut.suffix
      predicate = evaluateSuffix
    } else if (anythingBut['equals-ignore-case'] != null) {
      notCondition = anythingBut['equals-ignore-case']
      predicate = evaluateEqualIgnoreCase
    } else if (anythingBut.wildcard != null) {
      notCondition = anythingBut.wildcard
      predicate = evaluateWildcard
    } else {
      // Should not happen — patterns are validated on rule creation.
      return false
    }

    if (typeof notCondition === 'string') {
      return !predicate(notCondition, value)
    }
    if (Array.isArray(notCondition)) {
      return notCondition.every((sub) => !predicate(sub, value))
    }
    return false
  }

  if (Array.isArray(anythingBut)) {
    return !anythingBut.includes(value)
  }

  return value !== anythingBut
}

/**
 * Port of `_evaluate_prefix`: true when `value` is a string starting with
 * `condition`.
 *
 * @param {string} condition
 * @param {*} value
 * @returns {boolean}
 */
function evaluatePrefix(condition, value) {
  return typeof value === 'string' && value.startsWith(condition)
}

/**
 * Port of `_evaluate_suffix`: true when `value` is a string ending with
 * `condition`.
 *
 * @param {string} condition
 * @param {*} value
 * @returns {boolean}
 */
function evaluateSuffix(condition, value) {
  return typeof value === 'string' && value.endsWith(condition)
}

/**
 * Port of `_evaluate_equal_ignore_case`: case-insensitive string equality.
 *
 * @param {string} condition
 * @param {*} value
 * @returns {boolean}
 */
function evaluateEqualIgnoreCase(condition, value) {
  return (
    typeof value === 'string' &&
    String(condition).toLowerCase() === value.toLowerCase()
  )
}

/**
 * Port of `_evaluate_wildcard`. A `*` in the pattern matches one-or-more of any
 * character; the match is anchored at both ends. All other characters are
 * matched literally.
 *
 * @param {string} condition
 * @param {*} value
 * @returns {boolean}
 */
function evaluateWildcard(condition, value) {
  if (typeof value !== 'string') return false
  const escaped = escapeRegExp(condition).replace(/\\\*/g, '.+')
  return new RegExp(`^${escaped}$`).test(value)
}

/**
 * Port of `_evaluate_cidr`: IPv4/IPv6 CIDR membership test.
 *
 * @param {string} condition - e.g. `10.0.0.0/24` or `2001:db8::/32`.
 * @param {*} value - the candidate IP address.
 * @returns {boolean}
 */
function evaluateCidr(condition, value) {
  return cidrContains(condition, value)
}

/**
 * Port of `_evaluate_numeric_condition`. Supports a single `[op, n]` and a range
 * `[op1, n1, op2, n2]`. Operators: `<`, `<=`, `=`, `>=`, `>`. Only real numbers
 * (not numeric strings, not booleans) are eligible — mirroring the port's
 * `isinstance(value, (int, float))` guard.
 *
 * @param {Array} conditions
 * @param {*} value
 * @returns {boolean}
 */
function evaluateNumericCondition(conditions, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return false

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
 * Port of `flatten_pattern`. Flattens a (possibly nested) pattern to a single
 * level, joining nested keys with `.`. `$or` (a list with more than one entry)
 * multiplies the current branches, yielding one output dict per alternative.
 *
 * @param {object} nestedDict
 * @returns {object[]}
 */
export function flattenPattern(nestedDict) {
  function traverse(obj, array = [{}], parentKey = null) {
    let acc = array
    for (const [key, values] of Object.entries(obj)) {
      if (key === '$or' && Array.isArray(values) && values.length > 1) {
        // $or branches the current accumulator: each alternative is traversed
        // against every existing branch.
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
 * the payload relevant to the pattern keys.
 *
 * @param {object} payload
 * @param {object[]} patterns
 * @returns {object[]}
 */
export function flattenPayload(payload, patterns) {
  const patternKeys = new Set()
  for (const conditions of patterns) {
    for (const key of Object.keys(conditions)) patternKeys.add(key)
  }

  function isKeyInPatterns(key) {
    if (key == null) return true
    for (const patternKey of patternKeys) {
      if (patternKey.startsWith(key)) return true
    }
    return false
  }

  function traverse(object, array = [{}], parentKey = null) {
    let acc = array
    if (isPlainObject(object)) {
      for (const [key, values] of Object.entries(object)) {
        const nextKey = parentKey ? `${parentKey}.${key}` : key
        // Only build the parts of the payload relevant to the pattern; the
        // event could be large while the pattern targets a small slice.
        if (isKeyInPatterns(nextKey)) {
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
 * Parse a JSON string, returning `undefined` on malformed input rather than
 * throwing.
 *
 * @param {string} text
 * @returns {*}
 */
function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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
 * Whether a pattern is empty (null/undefined or an object with no keys).
 *
 * @param {*} pattern
 * @returns {boolean}
 */
function isEmptyPattern(pattern) {
  return (
    pattern == null ||
    (isPlainObject(pattern) && Object.keys(pattern).length === 0)
  )
}

/**
 * Escape a string for safe inclusion in a regular expression (mirrors Python's
 * `re.escape`).
 *
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
