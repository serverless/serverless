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
  properties: {
    awsApiPort: { type: 'integer', minimum: 1, maximum: 65535 },
    appPort: { type: 'integer', minimum: 1, maximum: 65535 },
    customAuthenticationProvider: { type: 'string' },
    host: { type: 'string' },
    watch: { type: 'boolean' },
    noWatch: { type: 'boolean' },
    terminateIdleLambdaTime: { type: 'integer', minimum: 0 },
    prefix: { type: 'string' },
    noPrependStageInUrl: { type: 'boolean' },
    useInProcess: { type: 'boolean' },
  },
}

export default offlineSchema
