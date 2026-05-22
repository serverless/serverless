/**
 * Top-level `offline:` schema for the built-in sls offline command.
 *
 * Single source of truth for the offline config schema. Add sub-properties
 * to `properties` here as new capabilities are introduced. The plugin's
 * `index.js` calls `defineTopLevelProperty('offline', schema)` exactly
 * once at construction — do not mutate the schema handler internals from
 * elsewhere.
 */
const offlineSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
}

export default offlineSchema
