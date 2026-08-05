// JSON schema for the top-level `mcp` property. Definitions like awsArn are
// registered by the AWS provider on the same root schema, so $ref works here.
//
// Exported as a factory: `validateConfig` resolves `$ref`s by mutating the
// registered schema in place (`normalizeSchemaObject`), so every Serverless
// instance must get its own copy rather than sharing a module-level object.
export default () => ({
  type: 'object',
  properties: {
    servers: {
      type: 'object',
      minProperties: 1,
      propertyNames: { pattern: '^[a-zA-Z0-9-_]+$' },
      additionalProperties: {
        type: 'object',
        properties: {
          server: {
            description: `Path to a module whose default export exposes the MCP SDK handler's web-standard fetch.`,
            type: 'string',
          },
          auth: {
            description: `OIDC bearer-token enforcement plus the OAuth protected-resource discovery route.`,
            type: 'object',
            properties: {
              issuer: { type: 'string', pattern: '^https://' },
              audiences: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
              authorizer: {
                description: `Name of a user-provided authorizer function, wired to the MCP route for rejection before invoke.`,
                type: 'string',
              },
            },
            required: ['issuer', 'audiences'],
            additionalProperties: false,
          },
          timeout: {
            description: `Max tool duration in seconds; drives the function timeout and the streaming integration timeout together.
@default 60`,
            type: 'integer',
            minimum: 1,
            maximum: 900,
          },
          memorySize: { type: 'integer', minimum: 128, maximum: 10240 },
          environment: { $ref: '#/definitions/awsLambdaEnvironment' },
          state: {
            description: `Elicitation round-trip key: true auto-provisions a Secrets Manager secret; a literal SSM or Secrets Manager ARN brings your own.`,
            // `awsArnString` rather than `awsArn`: an intrinsic hides the ARN's
            // service, which is what decides between `ssm:GetParameter` and
            // `secretsmanager:GetSecretValue` for the execution-role grant.
            anyOf: [
              { type: 'boolean' },
              { $ref: '#/definitions/awsArnString' },
            ],
          },
        },
        required: ['server'],
        additionalProperties: false,
      },
    },
  },
  required: ['servers'],
  additionalProperties: false,
})
