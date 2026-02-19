'use strict'

/**
 * Merge tags from multiple sources with proper precedence
 */
export function mergeTags(defaultTags = {}, resourceTags = {}) {
  const tags = {
    ...defaultTags,
    ...resourceTags,
  }

  return tags
}

/**
 * Convert tags object to CloudFormation Tags array format
 */
export function tagsToCloudFormationArray(tags) {
  return Object.entries(tags).map(([Key, Value]) => ({
    Key,
    Value: String(Value),
  }))
}

/**
 * Convert CloudFormation Tags array to object format
 */
export function cloudFormationArrayToTags(tagsArray) {
  return tagsArray.reduce((acc, { Key, Value }) => {
    acc[Key] = Value
    return acc
  }, {})
}
