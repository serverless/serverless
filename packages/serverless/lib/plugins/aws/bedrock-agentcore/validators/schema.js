'use strict'

/**
 * Define JSON Schema validation for the 'agents' top-level configuration
 */
export function defineAgentsSchema(serverless) {
  serverless.configSchemaHandler.defineTopLevelProperty('agents', {
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'runtime',
            'memory',
            'gateway',
            'browser',
            'codeInterpreter',
            'workloadIdentity',
          ],
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

        // Memory-specific properties
        eventExpiryDuration: {
          type: 'number',
          minimum: 7,
          maximum: 365,
        },
        encryptionKeyArn: {
          type: 'string',
        },
        strategies: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },

        // Gateway-specific properties
        authorizerType: {
          type: 'string',
          enum: ['NONE', 'AWS_IAM', 'CUSTOM_JWT'],
        },
        protocolType: {
          type: 'string',
          enum: ['MCP'],
        },
        authorizerConfiguration: {
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
                allowedScopes: {
                  type: 'array',
                  items: { type: 'string' },
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
                },
                searchType: {
                  type: 'string',
                  enum: ['SEMANTIC'],
                },
              },
            },
          },
        },
        exceptionLevel: {
          type: 'string',
          enum: ['DEBUG'],
        },
        kmsKeyArn: {
          type: 'string',
        },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: {
                type: 'string',
                enum: ['openapi', 'lambda', 'smithy'],
              },
              description: { type: 'string' },
              functionArn: { type: 'string' },
              functionName: { type: 'string' },
              s3: {
                type: 'object',
                properties: {
                  bucket: { type: 'string' },
                  key: { type: 'string' },
                  uri: { type: 'string' },
                  bucketOwnerAccountId: { type: 'string' },
                },
              },
              inlinePayload: { type: 'string' },
              toolSchema: {
                type: 'object',
                properties: {
                  s3: {
                    type: 'object',
                    properties: {
                      bucket: { type: 'string' },
                      key: { type: 'string' },
                      uri: { type: 'string' },
                      bucketOwnerAccountId: { type: 'string' },
                    },
                  },
                  inlinePayload: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                        inputSchema: { type: 'object' },
                        outputSchema: { type: 'object' },
                      },
                      required: ['name', 'description', 'inputSchema'],
                    },
                  },
                },
              },
              credentialProvider: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['GATEWAY_IAM_ROLE', 'OAUTH', 'API_KEY'],
                  },
                  oauthConfig: {
                    type: 'object',
                    properties: {
                      providerArn: { type: 'string' },
                      scopes: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                      },
                      grantType: {
                        type: 'string',
                        enum: ['AUTHORIZATION_CODE', 'CLIENT_CREDENTIALS'],
                      },
                      defaultReturnUrl: { type: 'string' },
                      customParameters: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                      },
                    },
                    required: ['providerArn', 'scopes'],
                  },
                  apiKeyConfig: {
                    type: 'object',
                    properties: {
                      providerArn: { type: 'string' },
                      credentialLocation: {
                        type: 'string',
                        enum: ['HEADER', 'QUERY_PARAMETER'],
                      },
                      credentialParameterName: {
                        type: 'string',
                        maxLength: 64,
                      },
                      credentialPrefix: {
                        type: 'string',
                        maxLength: 64,
                      },
                    },
                    required: ['providerArn'],
                  },
                },
              },
            },
            required: ['name'],
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
}
