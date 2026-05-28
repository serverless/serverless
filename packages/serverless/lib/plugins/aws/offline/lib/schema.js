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
    appPort: { type: 'integer', minimum: 1, maximum: 65535 },
    awsApiPort: { type: 'integer', minimum: 1, maximum: 65535 },
    corsAllowHeaders: { type: 'string' },
    corsAllowOrigin: { type: 'string' },
    corsDisallowCredentials: { type: 'boolean' },
    corsExposedHeaders: { type: 'string' },
    customAuthenticationProvider: { type: 'string' },
    disableCookieValidation: { type: 'boolean' },
    dockerHost: { type: 'string' },
    dockerHostServicePath: { type: 'string' },
    dockerNetwork: { type: 'string' },
    dockerReadOnly: { type: 'boolean' },
    enforceSecureCookies: { type: 'boolean' },
    host: { type: 'string' },
    httpsProtocol: { type: 'string' },
    ignoreJWTSignature: { type: 'boolean' },
    localEnvironment: { type: 'boolean' },
    noAuth: { type: 'boolean' },
    noPrependStageInUrl: { type: 'boolean' },
    noWatch: { type: 'boolean' },
    prefix: { type: 'string' },
    terminateIdleLambdaTime: { type: 'integer', minimum: 0 },
    useDocker: { type: 'boolean' },
    useInProcess: { type: 'boolean' },
    watch: { type: 'boolean' },
    webSocketHardTimeout: { type: 'integer', minimum: 1 },
    webSocketIdleTimeout: { type: 'integer', minimum: 1 },
  },
}

export default offlineSchema
