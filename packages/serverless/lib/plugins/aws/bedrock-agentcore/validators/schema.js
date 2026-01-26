'use strict'

/**
 * Memory configuration schema (used for both inline and shared memory definitions)
 * User-friendly property names that map to CFN:
 *   - expiration -> EventExpiryDuration
 *   - encryptionKey -> EncryptionKeyArn
 *   - strategies -> MemoryStrategies
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
    roleArn: {
      type: 'string',
      pattern: '^arn:aws(-[^:]+)?:iam::([0-9]{12})?:role/.+$',
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
 */
const credentialsConfigSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['GATEWAY_IAM_ROLE', 'OAUTH', 'API_KEY'],
      default: 'GATEWAY_IAM_ROLE',
    },
    // OAuth config (required when type: OAUTH)
    providerArn: {
      type: 'string',
      pattern: '^arn:([^:]*):([^:]*):([^:]*):([0-9]{12})?:(.+)$',
    },
    scopes: {
      type: 'array',
      items: { type: 'string', maxLength: 64, minLength: 1 },
      maxItems: 100,
    },
    grantType: {
      type: 'string',
      enum: ['AUTHORIZATION_CODE', 'CLIENT_CREDENTIALS'],
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
    credentialLocation: {
      type: 'string',
      enum: ['HEADER', 'QUERY_PARAMETER'],
    },
    credentialParameterName: {
      type: 'string',
      maxLength: 64,
      minLength: 1,
    },
    credentialPrefix: {
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
 * Gateway configuration schema for provider.agents.gateway
 * Configures the auto-created gateway for the service
 */
const gatewayConfigSchema = {
  type: 'object',
  properties: {
    authorizerType: {
      type: 'string',
      enum: ['NONE', 'AWS_IAM', 'CUSTOM_JWT'],
      default: 'AWS_IAM',
    },
    protocolType: {
      type: 'string',
      enum: ['MCP'],
      default: 'MCP',
    },
    description: {
      type: 'string',
      maxLength: 200,
      minLength: 1,
    },
    roleArn: {
      type: 'string',
      pattern: '^arn:aws(-[^:]+)?:iam::([0-9]{12})?:role/.+$',
    },
    kmsKeyArn: {
      type: 'string',
      pattern:
        '^arn:aws(|-cn|-us-gov):kms:[a-zA-Z0-9-]*:[0-9]{12}:key/[a-zA-Z0-9-]{36}$',
    },
    exceptionLevel: {
      type: 'string',
      enum: ['DEBUG'],
    },
    authorizerConfiguration: {
      type: 'object',
      properties: {
        customJwtAuthorizer: {
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
                    type: 'string',
                    enum: ['STRING', 'STRING_ARRAY'],
                  },
                  authorizingClaimMatchValue: {
                    type: 'object',
                    properties: {
                      claimMatchOperator: {
                        type: 'string',
                        enum: ['EQUALS', 'CONTAINS', 'CONTAINS_ANY'],
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
        },
      },
    },
    protocolConfiguration: {
      type: 'object',
      properties: {
        mcp: {
          type: 'object',
          properties: {
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
              type: 'string',
              enum: ['SEMANTIC'],
            },
          },
        },
      },
    },
    interceptorConfigurations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          interceptor: {
            type: 'object',
            properties: {
              lambda: {
                type: 'object',
                properties: {
                  arn: { type: 'string' },
                },
                required: ['arn'],
              },
            },
          },
          interceptionPoints: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['REQUEST', 'RESPONSE'],
            },
            minItems: 1,
            maxItems: 2,
          },
          inputConfiguration: {
            type: 'object',
            properties: {
              passRequestHeaders: { type: 'boolean' },
            },
          },
        },
        required: ['interceptor', 'interceptionPoints'],
      },
      minItems: 1,
      maxItems: 2,
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
}

/**
 * Define JSON Schema validation for the 'agents' top-level configuration
 *
 * Reserved keys at agents level:
 *   - 'memory': Shared memory definitions (not treated as an agent)
 *   - 'tools': Shared tool definitions (not treated as an agent)
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
    },
    additionalProperties: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['runtime', 'browser', 'codeInterpreter', 'workloadIdentity'],
          default: 'runtime',
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
        roleArn: {
          type: 'string',
          pattern: '^arn:aws(-[^:]+)?:iam::([0-9]{12})?:role/.+$',
        },

        // Memory configuration for runtime agents
        // Can be a string (reference to shared memory) or object (inline memory config)
        memory: {
          anyOf: [
            { type: 'string' }, // Reference to shared memory by name
            memoryConfigSchema, // Inline memory configuration
          ],
        },

        // Tools configuration for runtime agents
        // Object with tool names as keys, values are tool configs or string references
        tools: toolsCollectionSchema,

        // Runtime-specific properties
        artifact: {
          type: 'object',
          properties: {
            containerImage: { type: 'string' },
            docker: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                file: { type: 'string' },
                repository: { type: 'string' },
                buildArgs: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
            s3: {
              type: 'object',
              properties: {
                bucket: { type: 'string' },
                key: { type: 'string' },
                versionId: { type: 'string' },
              },
              // bucket and key not required - if omitted, use deployment bucket
            },
            entryPoint: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 2,
            },
            runtime: {
              type: 'string',
              enum: [
                'PYTHON_3_10',
                'PYTHON_3_11',
                'PYTHON_3_12',
                'PYTHON_3_13',
              ],
              // Defaults to PYTHON_3_13 for code deployment
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
        protocol: {
          type: 'string',
          enum: ['HTTP', 'MCP', 'A2A'],
        },
        environment: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        network: {
          type: 'object',
          properties: {
            networkMode: {
              type: 'string',
              enum: ['PUBLIC', 'VPC', 'SANDBOX'],
            },
            vpcConfig: {
              type: 'object',
              properties: {
                subnets: {
                  type: 'array',
                  items: { type: 'string' },
                },
                securityGroups: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['subnets', 'securityGroups'],
            },
          },
        },
        authorizer: {
          type: 'object',
          properties: {
            customJwtAuthorizer: {
              type: 'object',
              properties: {
                discoveryUrl: { type: 'string' },
                allowedAudience: {
                  type: 'array',
                  items: { type: 'string' },
                },
                allowedClients: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['discoveryUrl'],
            },
          },
        },
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

        // WorkloadIdentity-specific properties
        oauth2ReturnUrls: {
          type: 'array',
          items: { type: 'string' },
        },

        // Browser-specific properties
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
      },
    },
  })

  // Add custom.agentCore schema for default tags
  serverless.configSchemaHandler.defineCustomProperties({
    type: 'object',
    properties: {
      agentCore: {
        type: 'object',
        properties: {
          defaultTags: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  })

  // Add provider.agents schema for gateway configuration
  // We need to directly extend the provider schema since defineProvider would cause collision
  if (serverless.configSchemaHandler.schema?.properties?.provider?.properties) {
    serverless.configSchemaHandler.schema.properties.provider.properties.agents =
      {
        type: 'object',
        properties: {
          gateway: gatewayConfigSchema,
        },
        additionalProperties: false,
      }
  }
}

// Export schemas for use in validation and testing
export {
  memoryConfigSchema,
  toolConfigSchema,
  toolsCollectionSchema,
  credentialsConfigSchema,
  gatewayConfigSchema,
  toolSchemaItemSchema,
}
