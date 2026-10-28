const PLACEHOLDER_PREFIX = '__sls_intrinsic_'

const isIntrinsic = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && (keys[0] === 'Ref' || keys[0].startsWith('Fn::'))
}

// JSON.stringify escapes backslashes, quotes and control characters (a
// newline from a YAML block scalar, a tab) alike and leaves `${...}` alone.
const escapeForJsonString = (text) => JSON.stringify(text).slice(1, -1)

// The intrinsic resolves inside a JSON string, so an Fn::Sub template's
// literal text must be JSON-escaped. Its variable map is left alone.
const escapeIntrinsic = (intrinsic) => {
  const sub = intrinsic['Fn::Sub']
  if (typeof sub === 'string') return { 'Fn::Sub': escapeForJsonString(sub) }
  if (Array.isArray(sub) && typeof sub[0] === 'string') {
    return { 'Fn::Sub': [escapeForJsonString(sub[0]), ...sub.slice(1)] }
  }
  return intrinsic
}

// A marker that occurs nowhere in the serialized pattern, so placeholders
// cannot collide with user content.
const pickMarker = (serialized) => {
  let marker = PLACEHOLDER_PREFIX
  let attempt = 0
  while (serialized.includes(marker)) {
    attempt += 1
    marker = `${PLACEHOLDER_PREFIX}${attempt}_`
  }
  return marker
}

/**
 * Compiles an `eventBridge` event's `pattern` into the JSON string that an
 * EventBridge Custom Event Bus subscriber's `Filter.Pattern` takes. Intrinsic
 * functions in the pattern are joined into the string with `Fn::Join`.
 *
 * @param {object} pattern
 * @returns {string | { 'Fn::Join': ['', Array<string|object>] }}
 */
const compileFilterPattern = (pattern) => {
  const marker = pickMarker(JSON.stringify(pattern))
  const intrinsics = []

  const replaceIntrinsics = (value) => {
    if (isIntrinsic(value)) {
      intrinsics.push(escapeIntrinsic(value))
      return `${marker}${intrinsics.length - 1}__`
    }
    if (Array.isArray(value)) return value.map(replaceIntrinsics)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          replaceIntrinsics(item),
        ]),
      )
    }
    return value
  }

  const serialized = JSON.stringify(replaceIntrinsics(pattern))
  if (!intrinsics.length) return serialized

  // With a capturing group, split alternates literal chunks and indexes.
  const parts = serialized
    .split(new RegExp(`${marker}(\\d+)__`))
    .map((part, i) => (i % 2 ? intrinsics[Number(part)] : part))
    .filter((part) => part !== '')

  return { 'Fn::Join': ['', parts] }
}

export { compileFilterPattern }
