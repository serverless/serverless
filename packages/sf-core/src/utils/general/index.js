/**
 * General Utilities
 */
import crypto from 'crypto'
import _ from 'lodash'

/**
 * Generates a short id
 */
export const generateShortId = () => {
  return crypto.randomBytes(3).toString('hex')
}

/**
 * Retrieves CLI options.
 * @param {Object} params - The parameter object.
 * @param {string} params.option - The CLI option to search for (without dashes).
 * @returns {string|undefined} The value for the given CLI option, if any.
 */
export const getCliOption = ({ option }) => {
  const args = process.argv.slice(2)
  let value

  args.forEach((arg, index) => {
    if (arg === `--${option}` && args[index + 1]) {
      value = args[index + 1]
    }
  })

  return value
}

/**
 * Returns a human friendly time string.
 * @param {Object} params - The parameter object.
 * @param {number} params.seconds - Time in seconds.
 * @returns {string} Human friendly time string.
 */
export const getHumanFriendlyTime = ({ seconds }) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`
}

/**
 * Performs deep comparison between two objects and returns detailed changes.
 *
 * @param {Object} params - Parameters.
 * @param {Object} params.oldObj - Original object to compare.
 * @param {Object} params.newObj - New object to compare against.
 * @param {Object} [params.options] - Optional configuration.
 * @param {number} [params.options.maxDepth=20] - Maximum recursion depth.
 * @param {Array<string>} [params.options.ignore=[]] - Paths to ignore.
 * @returns {Object} Detailed changes including nested differences.
 */
export const diffObjects = ({ oldObj, newObj, options = {} }) => {
  const { maxDepth = 20, ignore = [] } = options

  const changes = {
    added: {},
    removed: {},
    updated: {},
  }

  /**
   * Sets a value at a nested path in an object.
   * @param {Object} obj - Target object.
   * @param {string} path - Dot notation path.
   * @param {*} value - Value to set.
   */
  const setNestedValue = (obj, path, value) => {
    _.set(obj, path, value)
  }

  /**
   * Recursively compares two values and tracks their differences.
   * @param {*} oldVal - Original value.
   * @param {*} newVal - New value to compare against.
   * @param {string} path - Current object path in dot notation.
   * @param {number} depth - Current recursion depth.
   */
  const compare = (oldVal, newVal, path = '', depth = 0) => {
    // Prevent stack overflow with deep objects
    if (depth > maxDepth) {
      setNestedValue(changes.updated, path, {
        from: oldVal,
        to: newVal,
        note: 'Max depth exceeded',
      })
      return
    }

    // Skip ignored paths
    if (ignore.some((ignorePath) => path.startsWith(ignorePath))) {
      return
    }

    // Handle null/undefined
    if (oldVal == null || newVal == null) {
      if (oldVal !== newVal) {
        setNestedValue(changes.updated, path, {
          from: oldVal,
          to: newVal,
        })
      }
      return
    }

    // Handle different types
    if (typeof oldVal !== typeof newVal) {
      setNestedValue(changes.updated, path, {
        from: oldVal,
        to: newVal,
        note: 'Type changed',
      })
      return
    }

    // Handle arrays
    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (!_.isEqual(oldVal, newVal)) {
        setNestedValue(changes.updated, path, {
          from: oldVal,
          to: newVal,
          arrayDiff: {
            added: _.difference(newVal, oldVal),
            removed: _.difference(oldVal, newVal),
          },
        })
      }
      return
    }

    // Handle objects
    if (_.isPlainObject(oldVal) && _.isPlainObject(newVal)) {
      const allKeys = _.union(Object.keys(oldVal), Object.keys(newVal))

      allKeys.forEach((key) => {
        const currentPath = path ? `${path}.${key}` : key

        if (!(key in oldVal)) {
          setNestedValue(changes.added, currentPath, newVal[key])
        } else if (!(key in newVal)) {
          setNestedValue(changes.removed, currentPath, oldVal[key])
        } else if (!_.isEqual(oldVal[key], newVal[key])) {
          compare(oldVal[key], newVal[key], currentPath, depth + 1)
        }
      })
      return
    }

    // Handle primitive values
    if (!_.isEqual(oldVal, newVal)) {
      setNestedValue(changes.updated, path, {
        from: oldVal,
        to: newVal,
      })
    }
  }

  compare(oldObj, newObj)

  // Clean up empty change categories
  return _.omitBy(changes, (value) => _.isEmpty(value))
}

/**
 * Creates an irreversible scrambled placeholder for sensitive values without using a key.
 *
 * A one-way SHA-256 hash is computed from the provided value (converted to a string),
 * and the first 6 characters (this length can be adjusted as needed) of the hash are used.
 * This approach ensures that for the same input the output is always consistent,
 * while being irreversible.
 *
 * Note: Because no secret key is used here, if the sensitive inputs are drawn from a small or predictable
 * set, it may be possible for an adversary to precompute the possible outputs. This method is only recommended
 * if you fully understand the potential risks.
 *
 * @param {Object} params - Parameters for scrambling.
 * @param {string} params.value - The sensitive value to scramble.
 * @param {string} [params.prefix=''] - Optional prefix to identify the type of sensitive data.
 * @returns {string} A scrambled string consisting of the prefix and a fixed-length hash segment.
 */
export const scrambleSensitiveValue = ({ value, prefix = '' }) => {
  // Only return the original value if it is explicitly null or undefined.
  if (value === null || value === undefined) return value

  // Check if the value already appears to be scrambled.
  if (typeof value === 'string') {
    const pattern = prefix
      ? new RegExp(`^${prefix}[0-9a-f]{6}$`)
      : /^[0-9a-f]{6}$/
    if (pattern.test(value)) {
      return value
    }
  }

  // Compute a deterministic hash using only the input value.
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex')

  // Use the first 6 characters of the hash as the scrambled output.
  const scrambled = hash.substring(0, 6)

  return prefix ? `${prefix}${scrambled}` : scrambled
}

/**
 * Recursively obfuscates all nested properties of a given value.
 * If the value is a non-object (a leaf node), obfuscate it.
 * If the value is an object or an array, recursively traverse and obfuscate each element.
 *
 * Note: The obfuscation performed here is intended to introduce an extra layer of friction for sensitive data.
 * It is not a substitute for proper encryption. Given the public nature of the fixed key,
 * secure any state storage used for persisting obfuscated data.
 *
 * @param {Object} params - The parameter object.
 * @param {any} params.value - The value to be obfuscated.
 * @param {string} params.prefix - The prefix to use for obfuscation.
 * @returns {Object|Array|any} The obfuscated value.
 */
const deepObfuscate = ({ value, prefix }) => {
  if (_.isPlainObject(value)) {
    const newObj = {}
    Object.entries(value).forEach(([key, val]) => {
      newObj[key] = deepObfuscate({ value: val, prefix })
    })
    return newObj
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepObfuscate({ value: item, prefix }))
  }

  // Leaf value - apply scrambleSensitiveValue directly.
  return scrambleSensitiveValue({ prefix, value })
}

/**
 * Recursively traverses an object, looking for keys that match any in the sensitiveKeys array.
 * When such a key is found, all nested values within its associated value will be obfuscated.
 *
 * This function clones the input object before traversing, ensuring the original object is not mutated.
 *
 * Note: Since the obfuscation key is public in the source code, this mechanism only provides a level of friction
 * for handling sensitive data and is not designed as a strong security measure. Secure state storage is mandatory
 * to prevent unauthorized access to the obfuscated representations.
 *
 * @param {Object} params - The parameter object.
 * @param {any} params.obj - The object to traverse and obfuscate (will not be mutated).
 * @param {string[]} [params.sensitiveKeys=["environment"]] - Array of keys to obfuscate.
 * @returns {Object|Array|any} A new object with obfuscated values for matched keys.
 */
export const obfuscateSensitiveData = ({
  obj,
  sensitiveKeys = ['environment'],
}) => {
  // Create a deep clone of the input to avoid mutating the original object.
  const clonedObj = _.cloneDeep(obj)

  /**
   * Recursively traverses the cloned object to obfuscate sensitive data.
   *
   * @param {Object|Array|any} data - The current object/array/value being processed.
   * @returns {Object|Array|any} Processed object with sensitive data obfuscated.
   */
  const traverseAndObfuscate = (data) => {
    if (_.isPlainObject(data)) {
      const newObj = {}
      Object.entries(data).forEach(([key, val]) => {
        if (sensitiveKeys.includes(key)) {
          newObj[key] = deepObfuscate({ value: val, prefix: `${key}-` })
        } else {
          newObj[key] = traverseAndObfuscate(val)
        }
      })
      return newObj
    }

    if (Array.isArray(data)) {
      return data.map((item) => traverseAndObfuscate(item))
    }

    return data
  }

  return traverseAndObfuscate(clonedObj)
}
