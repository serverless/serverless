/**
 * Top-level `offline:` schema for the built-in sls offline command.
 *
 * This file is the single source of truth for the offline config schema.
 * Subsequent milestones add their sub-properties to `properties` here.
 * The plugin's index.js calls `defineTopLevelProperty('offline', schema)`
 * exactly once at construction — never mutate the schema handler internals
 * from elsewhere.
 */
const offlineSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
}

export default offlineSchema
