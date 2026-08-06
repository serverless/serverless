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
          authorizer: {
            description: `Gateway-level access control for this server's MCP route: a user authorizer function name, an http-event-style authorizer object (request-type, Cognito user pool, existing authorizer id), or "aws_iam". Rejection happens before the function is invoked. The Framework never verifies tokens itself.`,
            // The object branch mirrors the http event's `authorizerSchema`
            // (aws/package/compile/events/api-gateway/index.js): the MCP route
            // compiles into the same API Gateway authorizer, so a config valid
            // on an http event has to stay valid here - intrinsics included,
            // since a same-stack Cognito pool arrives as Ref/Fn::GetAtt.
            anyOf: [
              { type: 'string', minLength: 1 },
              {
                type: 'object',
                properties: {
                  arn: { $ref: '#/definitions/awsArn' },
                  authorizerId: { $ref: '#/definitions/awsCfInstruction' },
                  claims: { type: 'array', items: { type: 'string' } },
                  identitySource: { type: 'string' },
                  identityValidationExpression: { type: 'string' },
                  managedExternally: { type: 'boolean' },
                  name: { type: 'string' },
                  resultTtlInSeconds: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 3600,
                  },
                  scopes: {
                    type: 'array',
                    items: {
                      anyOf: [
                        { type: 'string' },
                        { $ref: '#/definitions/awsCfInstruction' },
                      ],
                    },
                  },
                  type: { type: 'string' },
                },
                additionalProperties: false,
              },
            ],
          },
          oauthDiscovery: {
            description: `Publish this server's OAuth protected-resource metadata (RFC 9728) so interactive clients can discover where to log in. Advertisement only - enforcement is your "authorizer" or your module code.`,
            type: 'object',
            properties: {
              issuer: {
                description: `The authorization server that issues this server's tokens: its https issuer identifier, or a CloudFormation intrinsic resolving to one - a user pool created in this service's own "resources" has no literal URL until the stack is created.`,
                // The same idiom the `awsArn` definition uses for a value that
                // is either a constrained literal or an intrinsic: the pattern
                // stays on the string branch, so a literal is held to it while
                // a Ref / Fn::GetAtt / Fn::Sub is admitted whole.
                anyOf: [
                  { type: 'string', pattern: '^https://' },
                  { $ref: '#/definitions/awsCfFunction' },
                ],
              },
              publicUrl: {
                description: `The public URL clients use to reach this service - scheme, host, and any base path, everything before "/<name>/mcp". Set it when the domain is configured outside this service; otherwise it is derived from "provider.domain", falling back to the stage URL. Literal only: it names a front door that already exists, and the deploy prints it.`,
                type: 'string',
                pattern: '^https://',
              },
            },
            required: ['issuer'],
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
