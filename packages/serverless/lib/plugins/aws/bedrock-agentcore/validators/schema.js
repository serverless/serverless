'use strict'

/**
 * Helper function for case-insensitive enum matching in JSON Schema.
 * Creates a schema that matches the string case-insensitively.
 * Pattern from lib/plugins/aws/provider.js
 *
 * @param {string} str - The string value to match
 * @returns {object} JSON Schema object with case-insensitive regex
 * @example
 * // Matches 'NONE', 'none', 'None', etc.
 * { anyOf: ['NONE', 'AWS_IAM'].map(caseInsensitive) }
 */
function caseInsensitive(str) {
  return { type: 'string', regexp: new RegExp(`^${str}$`, 'i').toString() }
}

/**
 * IAM policy statement schema for role customization
 * Based on AWS IAM policy statement structure
 * Allows users to add custom IAM statements to auto-generated roles
 */
const iamPolicyStatementSchema = {
  type: 'object',
  properties: {
    Sid: { type: 'string' },
    Effect: { enum: ['Allow', 'Deny'] },
    Action: {
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    NotAction: {
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    Resource: {
      anyOf: [
        { type: 'string' },
        { type: 'array', items: { type: 'string' } },
        { type: 'object' }, // CloudFormation intrinsics
      ],
    },
    NotResource: {
      anyOf: [
        { type: 'string' },
        { type: 'array', items: { type: 'string' } },
        { type: 'object' },
      ],
    },
    Condition: { type: 'object' },
    Principal: {
      anyOf: [{ type: 'string' }, { type: 'object' }],
    },
    NotPrincipal: {
      anyOf: [{ type: 'string' }, { type: 'object' }],
    },
  },
  required: ['Effect'],
  additionalProperties: false,
}

/**
 * Role customization schema for IAM role configuration
 * Allows role to be either:
 *   - A string (existing IAM role ARN)
 *   - An object with customizations (name, statements, managedPolicies, etc.)
 */
const roleCustomizationSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    statements: {
      type: 'array',
      items: iamPolicyStatementSchema,
    },
    managedPolicies: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^arn:([^:]*):([^:]*):([^:]*):([0-9]{12})?:(.+)$',
      },
    },
    permissionsBoundary: {
      type: 'string',
      pattern: '^arn:([^:]*):([^:]*):([^:]*):([0-9]{12})?:(.+)$',
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
  additionalProperties: false,
}

/**
 * Memory configuration schema (used for both inline and shared memory definitions)
 * User-friendly property names that map to CFN:
 *   - expiration -> EventExpiryDuration
 *   - encryptionKey -> EncryptionKeyArn
 *   - strategies -> MemoryStrategies
 *   - role -> RoleArn (accepts ARN string, logical name, CF intrinsic, or customization object)
 */
const memoryConfigSchema = {
  type: 'object',
  properties: {
    expiration: {
      type: 'number',
      minimum: 7,
      maximum: 365,
    },
    encryptionKey: {
      type: 'string',
    },
    strategies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
    // Role - accepts ARN string, CloudFormation intrinsic, or customization object
    role: {
      anyOf: [
        { type: 'string' }, // ARN or logical name
        roleCustomizationSchema, // Customization object with statements, managedPolicies, etc.
        // CloudFormation intrinsic functions (Ref, Fn::GetAtt, etc.)
        {
          type: 'object',
          oneOf: [
            { required: ['Ref'] },
            { required: ['Fn::GetAtt'] },
            { required: ['Fn::ImportValue'] },
            { required: ['Fn::Sub'] },
            { required: ['Fn::Join'] },
          ],
        },
      ],
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 1200,
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
  additionalProperties: false,
}

/**
 * Credential provider configuration schema for gateway tools
 * Maps to CFN CredentialProviderConfiguration
 *
 * Property naming simplified (inside credentials object):
 *   - type -> CredentialProviderType
 *   - provider -> ProviderArn (Token Vault ARN)
 *   - location -> CredentialLocation
 *   - parameterName -> CredentialParameterName
 *   - prefix -> CredentialPrefix
 */
const credentialsConfigSchema = {
  type: 'object',
  properties: {
    type: {
      anyOf: ['GATEWAY_IAM_ROLE', 'OAUTH', 'API_KEY'].map(caseInsensitive),
      default: 'GATEWAY_IAM_ROLE',
    },
    // OAuth config (required when type: OAUTH)
    provider: {
      type: 'string', // Token Vault OAuth provider ARN
      pattern: '^arn:([^:]*):([^:]*):([^:]*):([0-9]{12})?:(.+)$',
    },
    scopes: {
      type: 'array',
      items: { type: 'string', maxLength: 64, minLength: 1 },
      maxItems: 100,
    },
    grantType: {
      anyOf: ['AUTHORIZATION_CODE', 'CLIENT_CREDENTIALS'].map(caseInsensitive),
    },
    defaultReturnUrl: {
      type: 'string',
      maxLength: 2048,
    },
    customParameters: {
      type: 'object',
      additionalProperties: { type: 'string' },
      maxProperties: 10,
    },
    // API Key config (required when type: API_KEY)
    location: {
      anyOf: ['HEADER', 'QUERY_PARAMETER'].map(caseInsensitive),
    },
    parameterName: {
      type: 'string',
      maxLength: 64,
      minLength: 1,
    },
    prefix: {
      type: 'string',
      maxLength: 64,
      minLength: 1,
    },
  },
}

/**
 * Tool schema item schema - defines structure of a single tool definition
 * Uses additionalProperties: true at all levels to allow flexible nested structures
 */
const toolSchemaItemSchema = {
  type: 'object',
  additionalProperties: true,
}

/**
 * Tool configuration schema
 * Supports four target types:
 *   - function: Lambda function tool (requires toolSchema)
 *   - openapi: OpenAPI schema tool
 *   - smithy: Smithy model tool
 *   - mcp: MCP server endpoint
 */
const toolConfigSchema = {
  type: 'object',
  properties: {
    // Lambda function tool - can be string (function name) or object with name/arn
    function: {
      anyOf: [
        { type: 'string' }, // Function name reference
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            arn: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
    },
    // OpenAPI schema tool
    openapi: {
      type: 'string', // File path or inline content
    },
    // Smithy model tool
    smithy: {
      type: 'string', // File path or inline content
    },
    // MCP server endpoint
    mcp: {
      type: 'string', // https:// URL
      pattern: '^https://.*',
    },
    // Tool schema for Lambda tools (required for function tools)
    // Can be inline array or file path reference
    // We allow any type here since the actual structure is validated at runtime
    // and CloudFormation will validate the final structure
    toolSchema: {},
    // Credential provider configuration
    credentials: credentialsConfigSchema,
    // Optional description
    description: {
      type: 'string',
      maxLength: 200,
      minLength: 1,
    },
  },
  additionalProperties: false,
}

/**
 * Tools collection schema
 * Object where keys are tool names and values are tool configs or string references
 */
const toolsCollectionSchema = {
  type: 'object',
  additionalProperties: {
    anyOf: [
      { type: 'string' }, // Reference to shared tool by name
      toolConfigSchema, // Inline tool configuration
    ],
  },
}

/**
 * Custom JWT authorizer configuration schema (Serverless Framework casing)
 * Maps to AWS::BedrockAgentCore::Gateway/Runtime CustomJWTAuthorizerConfiguration
 */
const jwtAuthorizerSchema = {
  type: 'object',
  properties: {
    discoveryUrl: {
      type: 'string',
      pattern: '^.+/\\.well-known/openid-configuration$',
    },
    allowedAudience: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    allowedClients: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    allowedScopes: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    customClaims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          inboundTokenClaimName: { type: 'string' },
          inboundTokenClaimValueType: {
            anyOf: ['STRING', 'STRING_ARRAY'].map(caseInsensitive),
          },
          authorizingClaimMatchValue: {
            type: 'object',
            properties: {
              claimMatchOperator: {
                anyOf: ['EQUALS', 'CONTAINS', 'CONTAINS_ANY'].map(
                  caseInsensitive,
                ),
              },
              claimMatchValue: {
                type: 'object',
                properties: {
                  matchValueString: { type: 'string' },
                  matchValueStringList: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  required: ['discoveryUrl'],
}

/**
 * Authorizer schema - used by both Gateway and Runtime
 * Can be a string shorthand (NONE, AWS_IAM, CUSTOM_JWT) or object with type and jwt config
 */
const authorizerSchema = {
  anyOf: [
    ...['NONE', 'AWS_IAM', 'CUSTOM_JWT'].map(caseInsensitive),
    {
      type: 'object',
      properties: {
        type: {
          anyOf: ['NONE', 'AWS_IAM', 'CUSTOM_JWT'].map(caseInsensitive),
        },
        jwt: jwtAuthorizerSchema,
      },
      required: ['type'],
    },
  ],
}

/**
 * Protocol configuration schema (flat structure)
 * Replaces protocolType + protocolConfiguration.mcp
 *
 * Example:
 *   protocol:
 *     type: MCP
 *     instructions: "..."
 *     searchType: SEMANTIC
 *     supportedVersions: ["2025-11-25"]
 */
const protocolSchema = {
  type: 'object',
  properties: {
    type: {
      anyOf: ['MCP'].map(caseInsensitive),
      default: 'MCP',
    },
    supportedVersions: {
      type: 'array',
      items: { type: 'string' },
    },
    instructions: {
      type: 'string',
      maxLength: 2048,
      minLength: 1,
    },
    searchType: {
      anyOf: ['SEMANTIC'].map(caseInsensitive),
    },
  },
}

/**
 * Network configuration schema (flattened structure)
 * Replaces networkMode + vpcConfig
 *
 * Example:
 *   network:
 *     mode: VPC
 *     subnets: [subnet-xxx]
 *     securityGroups: [sg-xxx]
 *
 * Network modes by resource type:
 *   - Runtime: PUBLIC, VPC
 *   - Browser: PUBLIC, VPC
 *   - CodeInterpreter: PUBLIC, SANDBOX (default), VPC
 */
const networkSchema = {
  type: 'object',
  properties: {
    mode: {
      anyOf: ['PUBLIC', 'VPC', 'SANDBOX'].map(caseInsensitive),
    },
    subnets: {
      type: 'array',
      items: { type: 'string' },
    },
    securityGroups: {
      type: 'array',
      items: { type: 'string' },
    },
  },
}

/**
 * Gateway entry schema for agents.gateways entries
 * Each gateway has an authorizer (string shorthand or object) and tools array
 */
const gatewayEntrySchema = {
  type: 'object',
  properties: {
    authorizer: authorizerSchema,
    // Tools - array of tool names referencing agents.tools
    tools: {
      type: 'array',
      items: { type: 'string' },
    },
    // Protocol configuration (flat)
    protocol: protocolSchema,
    description: {
      type: 'string',
      maxLength: 200,
      minLength: 1,
    },
    // Role - accepts ARN string, CloudFormation intrinsic, or customization object
    role: {
      anyOf: [
        { type: 'string' },
        roleCustomizationSchema,
        {
          type: 'object',
          oneOf: [
            { required: ['Ref'] },
            { required: ['Fn::GetAtt'] },
            { required: ['Fn::ImportValue'] },
            { required: ['Fn::Sub'] },
            { required: ['Fn::Join'] },
          ],
        },
      ],
    },
    kmsKey: {
      type: 'string',
      pattern:
        '^arn:aws(|-cn|-us-gov):kms:[a-zA-Z0-9-]*:[0-9]{12}:key/[a-zA-Z0-9-]{36}$',
    },
    exceptionLevel: {
      anyOf: ['DEBUG'].map(caseInsensitive),
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
}

/**
 * Gateways collection schema for agents.gateways
 * Object where keys are gateway names and values are gateway configs
 */
const gatewaysCollectionSchema = {
  type: 'object',
  additionalProperties: gatewayEntrySchema,
}

/**
 * Browser configuration schema for agents.browsers entries
 */
const browserConfigSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 1200,
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    role: {
      anyOf: [
        { type: 'string' },
        roleCustomizationSchema,
        {
          type: 'object',
          oneOf: [
            { required: ['Ref'] },
            { required: ['Fn::GetAtt'] },
            { required: ['Fn::ImportValue'] },
            { required: ['Fn::Sub'] },
            { required: ['Fn::Join'] },
          ],
        },
      ],
    },
    recording: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        s3Location: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            prefix: { type: 'string' },
          },
          required: ['bucket', 'prefix'],
        },
      },
    },
    signing: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
    },
    network: networkSchema,
  },
  additionalProperties: false,
}

/**
 * CodeInterpreter configuration schema for agents.codeInterpreters entries
 */
const codeInterpreterConfigSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 1200,
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    role: {
      anyOf: [
        { type: 'string' },
        roleCustomizationSchema,
        {
          type: 'object',
          oneOf: [
            { required: ['Ref'] },
            { required: ['Fn::GetAtt'] },
            { required: ['Fn::ImportValue'] },
            { required: ['Fn::Sub'] },
            { required: ['Fn::Join'] },
          ],
        },
      ],
    },
    network: networkSchema,
  },
  additionalProperties: false,
}

/**
 * Runtime agent configuration schema
 * Used for additionalProperties in agents (non-reserved keys)
 */
const runtimeAgentSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 1200,
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    role: {
      anyOf: [
        { type: 'string' },
        roleCustomizationSchema,
        {
          type: 'object',
          oneOf: [
            { required: ['Ref'] },
            { required: ['Fn::GetAtt'] },
            { required: ['Fn::ImportValue'] },
            { required: ['Fn::Sub'] },
            { required: ['Fn::Join'] },
          ],
        },
      ],
    },

    // Memory configuration for runtime agents
    // Can be a string (reference to shared memory) or object (inline memory config)
    memory: {
      anyOf: [
        { type: 'string' }, // Reference to shared memory by name
        memoryConfigSchema, // Inline memory configuration
      ],
    },

    // Gateway reference for runtime agents
    // String reference to a gateway defined in agents.gateways
    gateway: {
      type: 'string',
    },

    // Code deployment properties (at agent root level, similar to Lambda functions)
    handler: {
      type: 'string',
      // Python file for the agent entry point, e.g., 'agent.py'
    },
    runtime: {
      anyOf: ['PYTHON_3_10', 'PYTHON_3_11', 'PYTHON_3_12', 'PYTHON_3_13'].map(
        caseInsensitive,
      ),
      // Defaults to PYTHON_3_13 for code deployment
    },

    // Artifact configuration for container images or custom S3 locations
    artifact: {
      type: 'object',
      properties: {
        // Container image - string (pre-built URI) or object (build config)
        image: {
          anyOf: [
            { type: 'string' }, // Pre-built image URI
            {
              type: 'object',
              properties: {
                file: { type: 'string' }, // Dockerfile path, default: 'Dockerfile'
                path: { type: 'string' }, // Build context, default: '.'
                repository: { type: 'string' }, // ECR repository name
                buildArgs: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
          ],
        },
        // S3 location for code deployment (optional - uses deployment bucket if omitted)
        s3: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            key: { type: 'string' },
            versionId: { type: 'string' },
          },
        },
      },
    },
    // Package configuration for code deployment (same as Lambda)
    package: {
      type: 'object',
      properties: {
        patterns: {
          type: 'array',
          items: { type: 'string' },
        },
        include: {
          type: 'array',
          items: { type: 'string' },
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
        },
        artifact: { type: 'string' },
      },
    },
    // Runtime protocol (different from Gateway protocol - this is for runtime invocation)
    protocol: {
      anyOf: ['HTTP', 'MCP', 'A2A'].map(caseInsensitive),
    },
    environment: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    network: networkSchema,
    // Runtime authorizer - same structure as Gateway
    // Note: Runtime only supports CUSTOM_JWT (NONE = no authorizer, AWS_IAM not supported)
    authorizer: authorizerSchema,
    lifecycle: {
      type: 'object',
      properties: {
        idleRuntimeSessionTimeout: {
          type: 'number',
          minimum: 60,
          maximum: 28800,
        },
        maxLifetime: {
          type: 'number',
          minimum: 60,
          maximum: 28800,
        },
      },
    },
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    requestHeaders: {
      type: 'object',
      properties: {
        allowlist: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 20,
        },
      },
    },
  },
}

/**
 * Define JSON Schema validation for the 'agents' top-level configuration
 *
 * Reserved keys at agents level:
 *   - 'memory': Shared memory definitions
 *   - 'tools': Shared tool definitions
 *   - 'gateways': Gateway definitions with tool assignments
 *   - 'browsers': Browser resource definitions
 *   - 'codeInterpreters': CodeInterpreter resource definitions
 *
 * Any other key is treated as a Runtime agent definition.
 */
export function defineAgentsSchema(serverless) {
  serverless.configSchemaHandler.defineTopLevelProperty('agents', {
    type: 'object',
    properties: {
      // Reserved key for shared memory
      memory: {
        type: 'object',
        additionalProperties: memoryConfigSchema,
      },
      // Reserved key for shared tools
      tools: toolsCollectionSchema,
      // Reserved key for gateways with tool assignments
      gateways: gatewaysCollectionSchema,
      // Reserved key for browser resources
      browsers: {
        type: 'object',
        additionalProperties: browserConfigSchema,
      },
      // Reserved key for code interpreter resources
      codeInterpreters: {
        type: 'object',
        additionalProperties: codeInterpreterConfigSchema,
      },
    },
    // Any non-reserved key is a runtime agent
    additionalProperties: runtimeAgentSchema,
  })
}

// Export schemas for use in validation and testing
export {
  iamPolicyStatementSchema,
  roleCustomizationSchema,
  memoryConfigSchema,
  toolConfigSchema,
  toolsCollectionSchema,
  credentialsConfigSchema,
  gatewayEntrySchema,
  gatewaysCollectionSchema,
  jwtAuthorizerSchema,
  toolSchemaItemSchema,
  authorizerSchema,
  protocolSchema,
  networkSchema,
  browserConfigSchema,
  codeInterpreterConfigSchema,
  runtimeAgentSchema,
  caseInsensitive,
}
