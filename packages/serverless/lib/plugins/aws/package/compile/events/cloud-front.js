import _ from 'lodash'
import ServerlessError from '../../../../../serverless-error.js'
import { log, style } from '@serverless/util'

const originLimits = { maxTimeout: 30, maxMemorySize: 10240 }
const viewerLimits = { maxTimeout: 5, maxMemorySize: 128 }

class AwsCompileCloudFrontEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.lambdaEdgeLimits = {
      'origin-request': originLimits,
      'origin-response': originLimits,
      'viewer-request': viewerLimits,
      'viewer-response': viewerLimits,
      default: viewerLimits,
    }
    this.cachePolicies = new Set()

    const originObjectSchema = {
      description: `CloudFront origin configuration.`,
      type: 'object',
      properties: {
        ConnectionAttempts: {
          description: `Number of connection attempts CloudFront makes to the origin.`,
          type: 'integer',
          minimum: 1,
          maximum: 3,
        },
        ConnectionTimeout: {
          description: `Connection timeout to the origin in seconds.`,
          type: 'integer',
          minimum: 1,
          maximum: 10,
        },
        CustomOriginConfig: {
          description: `Custom HTTP origin configuration.`,
          type: 'object',
          properties: {
            HTTPPort: {
              description: `HTTP port for custom origin.`,
              type: 'integer',
              minimum: 0,
              maximum: 65535,
            },
            HTTPSPort: {
              description: `HTTPS port for custom origin.`,
              type: 'integer',
              minimum: 0,
              maximum: 65535,
            },
            OriginKeepaliveTimeout: {
              description: `Keepalive timeout to the origin in seconds.`,
              type: 'integer',
              minimum: 1,
              maximum: 60,
            },
            OriginProtocolPolicy: {
              description: `Protocol policy used by CloudFront when connecting to origin.`,
              enum: ['http-only', 'match-viewer', 'https-only'],
            },
            OriginReadTimeout: {
              description: `Read timeout from origin in seconds.`,
              type: 'integer',
              minimum: 1,
              maximum: 60,
            },
            OriginSSLProtocols: {
              description: `TLS/SSL protocol versions allowed for HTTPS origin requests.`,
              type: 'array',
              items: { enum: ['SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2'] },
            },
          },
          additionalProperties: false,
          required: ['OriginProtocolPolicy'],
        },
        DomainName: {
          description: `Origin domain name.`,
          anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
        },
        OriginAccessControlId: {
          description: `CloudFront Origin Access Control ID.`,
          anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
        },
        OriginCustomHeaders: {
          description: `Custom headers forwarded to origin.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              HeaderName: { type: 'string', description: `Header name.` },
              HeaderValue: { type: 'string', description: `Header value.` },
            },
            additionalProperties: false,
            required: ['HeaderName', 'HeaderValue'],
          },
        },
        OriginPath: {
          description: `Optional path prefix added to origin requests.`,
          type: 'string',
        },
        S3OriginConfig: {
          description: `S3 origin configuration.`,
          type: 'object',
          properties: {
            OriginAccessIdentity: {
              description: `Legacy CloudFront Origin Access Identity value.`,
              anyOf: [
                {
                  type: 'string',
                  pattern: '^origin-access-identity/cloudfront/.+',
                },
                { $ref: '#/definitions/awsCfFunction' },
              ],
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
      required: ['DomainName'],
      oneOf: [
        { required: ['CustomOriginConfig'] },
        { required: ['S3OriginConfig'] },
      ],
    }

    const behaviorObjectSchema = {
      type: 'object',
      properties: {
        AllowedMethods: {
          description: `Allowed HTTP methods for this cache behavior.`,
          anyOf: [
            {
              type: 'array',
              uniqueItems: true,
              minItems: 2,
              items: { enum: ['GET', 'HEAD'] },
            },
            {
              type: 'array',
              uniqueItems: true,
              minItems: 3,
              items: { enum: ['GET', 'HEAD', 'OPTIONS'] },
            },
            {
              type: 'array',
              uniqueItems: true,
              minItems: 7,
              items: {
                enum: [
                  'GET',
                  'HEAD',
                  'OPTIONS',
                  'PUT',
                  'PATCH',
                  'POST',
                  'DELETE',
                ],
              },
            },
          ],
        },
        CachedMethods: {
          description: `Methods cached by CloudFront.`,
          anyOf: [
            {
              type: 'array',
              uniqueItems: true,
              minItems: 2,
              items: { enum: ['GET', 'HEAD'] },
            },
            {
              type: 'array',
              uniqueItems: true,
              minItems: 3,
              items: { enum: ['GET', 'HEAD', 'OPTIONS'] },
            },
          ],
        },
        CachePolicyId: {
          description: `CloudFront Cache Policy ID.`,
          type: 'string',
        },
        Compress: {
          description: `Enable automatic compression.`,
          type: 'boolean',
        },
        FieldLevelEncryptionId: {
          description: `Field-level encryption configuration ID.`,
          type: 'string',
        },
        OriginRequestPolicyId: {
          description: `CloudFront Origin Request Policy ID.`,
          anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
        },
        ResponseHeadersPolicyId: {
          description: `CloudFront Response Headers Policy ID.`,
          anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
        },
        SmoothStreaming: {
          description: `Enable Microsoft Smooth Streaming.`,
          type: 'boolean',
        },
        TrustedSigners: {
          description: `AWS account IDs trusted to sign private content URLs.`,
          type: 'array',
          items: { type: 'string' },
        },
        ViewerProtocolPolicy: {
          description: `Viewer protocol policy.`,
          enum: ['allow-all', 'redirect-to-https', 'https-only'],
        },
        TrustedKeyGroups: {
          description: `Trusted key groups for signed URLs/cookies.`,
          type: 'array',
          items: {
            anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfRef' }],
          },
        },
        MaxTTL: { description: `Maximum TTL in seconds.`, type: 'number' },
        MinTTL: { description: `Minimum TTL in seconds.`, type: 'number' },
        DefaultTTL: { description: `Default TTL in seconds.`, type: 'number' },
        ForwardedValues: {
          description: `Legacy forwarding configuration.`,
          type: 'object',
          properties: {
            Cookies: {
              description: `Cookie forwarding settings.`,
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    Forward: {
                      description: `Cookie forwarding mode.`,
                      enum: ['all', 'none'],
                    },
                  },
                  additionalProperties: false,
                  required: ['Forward'],
                },
                {
                  type: 'object',
                  properties: {
                    Forward: {
                      description: `Cookie forwarding mode.`,
                      const: 'whitelist',
                    },
                    WhitelistedNames: {
                      description: `Cookie names to forward.`,
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  additionalProperties: false,
                  required: ['Forward', 'WhitelistedNames'],
                },
              ],
            },
            Headers: {
              description: `Request headers to forward.`,
              type: 'array',
              items: { type: 'string' },
            },
            QueryString: {
              description: `Whether to forward query strings.`,
              type: 'boolean',
            },
            QueryStringCacheKeys: {
              description: `Query string keys included in cache key.`,
              type: 'array',
              items: { type: 'string' },
            },
          },
          additionalProperties: false,
          required: ['QueryString'],
        },
      },
      additionalProperties: false,
    }

    this.serverless.configSchemaHandler.defineFunctionEvent(
      'aws',
      'cloudFront',
      {
        description: `CloudFront Lambda@Edge event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/cloudfront
@example
cloudFront:
  eventType: origin-request
  origin:
    DomainName: my-bucket.s3.amazonaws.com`,
        type: 'object',
        properties: {
          behavior: {
            ...behaviorObjectSchema,
            description: `CloudFront cache behavior overrides for this Lambda@Edge trigger.
@see https://www.serverless.com/framework/docs/providers/aws/events/cloudfront#cache-behavior-configuration`,
          },
          cachePolicy: {
            description: `Cache policy reference by id or name.`,
            type: 'object',
            properties: {
              id: {
                description: `Existing cache policy id.`,
                $ref: '#/definitions/awsCfInstruction',
              },
              name: {
                description: `Named cache policy from provider.cloudFront.cachePolicies.`,
                type: 'string',
                minLength: 1,
              },
            },
            oneOf: [{ required: ['id'] }, { required: ['name'] }],
            additionalProperties: false,
          },
          eventType: {
            description: `Lambda@Edge trigger: 'viewer-request', 'origin-request', 'origin-response', 'viewer-response'.`,
            enum: [
              'viewer-request',
              'origin-request',
              'origin-response',
              'viewer-response',
            ],
          },
          isDefaultOrigin: {
            description: `Treat this origin as the default distribution origin.`,
            type: 'boolean',
          },
          includeBody: {
            description: `Include request body in Lambda event.`,
            type: 'boolean',
          },
          origin: {
            description: `CloudFront origin configuration.`,
            anyOf: [{ type: 'string', format: 'uri' }, originObjectSchema],
          },
          // Allowed characters reference:
          // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesPathPattern
          // Still note it doesn't reference "?" character, which appears in prior examples,
          // Hence it's now included in this regex
          pathPattern: {
            description: `URL path pattern to match.`,
            type: 'string',
            pattern: '^([A-Za-z0-9_.*?$/~"\'@:+-]|&amp;)+$',
          },
        },
        additionalProperties: false,
      },
    )

    this.hooks = {
      'package:initialize': async () => this.validate(),
      'before:package:compileFunctions': async () => this.prepareFunctions(),
      'package:compileEvents': () => {
        this.compileCloudFrontCachePolicies()
        this.compileCloudFrontEvents()
      },
      'before:remove:remove': async () => this.logRemoveReminder(),
    }
  }

  logRemoveReminder() {
    if (this.serverless.processedInput.commands[0] === 'remove') {
      let isEventUsed = false
      const funcKeys = this.serverless.service.getAllFunctions()
      if (funcKeys.length) {
        isEventUsed = funcKeys.some((funcKey) => {
          const func = this.serverless.service.getFunction(funcKey)
          return (
            func.events &&
            func.events.find((e) => Object.keys(e)[0] === 'cloudFront')
          )
        })
      }
      if (isEventUsed) {
        const message = [
          "Don't forget to manually remove your Lambda@Edge functions ",
          'once the CloudFront distribution removal is successfully propagated!',
        ].join('')
        log.warning(message)
      }
    }
  }

  validate() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      functionObj.events.forEach(({ cloudFront }) => {
        if (!cloudFront) return
        const { eventType = 'default' } = cloudFront
        const { maxMemorySize, maxTimeout } = this.lambdaEdgeLimits[eventType]
        if (functionObj.memorySize && functionObj.memorySize > maxMemorySize) {
          throw new ServerlessError(
            `"${functionName}" memorySize is greater than ${maxMemorySize} which is not supported by Lambda@Edge functions of type "${eventType}"`,
            'LAMBDA_EDGE_UNSUPPORTED_MEMORY_SIZE',
          )
        }
        if (functionObj.timeout && functionObj.timeout > maxTimeout) {
          throw new ServerlessError(
            `"${functionName}" timeout is greater than ${maxTimeout} which is not supported by Lambda@Edge functions of type "${eventType}"`,
            'LAMBDA_EDGE_UNSUPPORTED_TIMEOUT_VALUE',
          )
        }
      })
    })
  }

  prepareFunctions() {
    // Lambda@Edge functions need to be versioned
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      if (functionObj.events.find((event) => event.cloudFront)) {
        // ensure that functions are versioned
        Object.assign(functionObj, { versionFunction: true })
        // set the maximum memory size if not explicitly configured
        if (!functionObj.memorySize) {
          Object.assign(functionObj, { memorySize: 128 })
        }
        // set the maximum timeout if not explicitly configured
        if (!functionObj.timeout) {
          Object.assign(functionObj, { timeout: 5 })
        }
      }
    })
  }

  compileCloudFrontCachePolicies() {
    const userConfig = this.serverless.service.provider.cloudFront || {}
    if (userConfig.cachePolicies) {
      const Resources =
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      for (const [name, cachePolicyConfig] of Object.entries(
        userConfig.cachePolicies,
      )) {
        this.cachePolicies.add(name)

        Object.assign(Resources, {
          [this.provider.naming.getCloudFrontCachePolicyLogicalId(name)]: {
            Type: 'AWS::CloudFront::CachePolicy',
            Properties: {
              CachePolicyConfig: {
                ...cachePolicyConfig,
                Name: this.provider.naming.getCloudFrontCachePolicyName(name),
              },
            },
          },
        })
      }
    }
  }

  compileCloudFrontEvents() {
    this.cloudFrontDistributionLogicalId =
      this.provider.naming.getCloudFrontDistributionLogicalId()

    this.cloudFrontDistributionDomainNameLogicalId =
      this.provider.naming.getCloudFrontDistributionDomainNameLogicalId()

    const lambdaAtEdgeFunctions = []

    const origins = []
    const behaviors = []
    let defaultOrigin

    const Resources =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources
    const Outputs =
      this.serverless.service.provider.compiledCloudFormationTemplate.Outputs

    // helper function for joining origins and behaviors
    function extendDeep(object, source) {
      return _.assignWith(object, source, (a, b) => {
        if (Array.isArray(a)) {
          return _.uniqWith(a.concat(b), _.isEqual)
        }
        if (_.isObject(a)) {
          extendDeep(a, b)
        }
        return a
      })
    }

    function createOrigin(origin, naming) {
      const originObj = {}
      if (typeof origin === 'string') {
        const originUrl = new URL(origin)
        Object.assign(originObj, {
          DomainName: originUrl.hostname,
        })

        if (originUrl.pathname && originUrl.pathname.length > 1) {
          Object.assign(originObj, { OriginPath: originUrl.pathname })
        }

        if (originUrl.protocol === 's3:') {
          Object.assign(originObj, { S3OriginConfig: {} })
        } else {
          Object.assign(originObj, {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'match-viewer',
            },
          })
        }
      } else {
        Object.assign(originObj, origin)
      }

      Object.assign(originObj, {
        Id: naming.getCloudFrontOriginId(originObj),
      })
      return originObj
    }

    const unusedUserDefinedCachePolicies = new Set(this.cachePolicies)
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cloudFront) {
            const lambdaFunctionLogicalId = Object.keys(Resources).find(
              (key) =>
                Resources[key].Type === 'AWS::Lambda::Function' &&
                Resources[key].Properties.FunctionName === functionObj.name,
            )

            // Remove VPC & Env vars from lambda@Edge
            delete Resources[lambdaFunctionLogicalId].Properties.VpcConfig
            delete Resources[lambdaFunctionLogicalId].Properties.Environment

            // Retain Lambda@Edge functions to avoid issues when removing the CloudFormation stack
            Object.assign(Resources[lambdaFunctionLogicalId], {
              DeletionPolicy: 'Retain',
            })

            const lambdaVersionLogicalId = Object.keys(Resources).find(
              (key) => {
                const resource = Resources[key]
                if (resource.Type !== 'AWS::Lambda::Version') return false
                return (
                  _.get(resource, 'Properties.FunctionName.Ref') ===
                  lambdaFunctionLogicalId
                )
              },
            )

            const pathPattern =
              typeof event.cloudFront.pathPattern === 'string'
                ? event.cloudFront.pathPattern
                : undefined

            let origin = createOrigin(
              event.cloudFront.origin,
              this.provider.naming,
            )
            const existingOrigin = origins.find((o) => o.Id === origin.Id)

            if (!existingOrigin) {
              origins.push(origin)
            } else {
              origin = extendDeep(existingOrigin, origin)
            }

            if (event.cloudFront.isDefaultOrigin) {
              if (defaultOrigin && defaultOrigin !== origin) {
                throw new ServerlessError(
                  'Found more than one cloudfront event with "isDefaultOrigin" defined',
                  'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS',
                )
              }
              defaultOrigin = origin
            }

            let behavior = {
              ViewerProtocolPolicy: 'allow-all',
            }
            let shouldAssignCachePolicy = true
            if (event.cloudFront.behavior) {
              Object.assign(behavior, event.cloudFront.behavior)
            }

            if (
              event.cloudFront.behavior &&
              event.cloudFront.behavior.CachePolicyId
            ) {
              Object.assign(behavior, {
                CachePolicyId: event.cloudFront.behavior.CachePolicyId,
              })
              shouldAssignCachePolicy = false
            }

            if (
              event.cloudFront.behavior &&
              (event.cloudFront.behavior.ForwardedValues ||
                event.cloudFront.behavior.MaxTTL != null ||
                event.cloudFront.behavior.MinTTL != null ||
                event.cloudFront.behavior.DefaultTTL != null)
            ) {
              shouldAssignCachePolicy = false
            }

            if (event.cloudFront.cachePolicy) {
              const { id, name } = event.cloudFront.cachePolicy
              if (name) {
                if (!this.cachePolicies.has(name)) {
                  throw new ServerlessError(
                    `Event references not configured cache policy '${name}'`,
                    'UNRECOGNIZED_CLOUDFRONT_CACHE_POLICY',
                  )
                }
                unusedUserDefinedCachePolicies.delete(name)
              }
              Object.assign(behavior, {
                CachePolicyId: id || {
                  Ref: this.provider.naming.getCloudFrontCachePolicyLogicalId(
                    name,
                  ),
                },
              })
              shouldAssignCachePolicy = false
            }

            // Assigning default cache policy only if cache policy reference is not defined.
            if (shouldAssignCachePolicy) {
              // Assigning default Managed-CachingOptimized Cache Policy.
              // See details at https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
              Object.assign(behavior, {
                CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
              })
            }

            const lambdaFunctionAssociation = {
              EventType: event.cloudFront.eventType,
              LambdaFunctionARN: {
                Ref: lambdaVersionLogicalId,
              },
            }

            if (event.cloudFront.includeBody != null) {
              lambdaFunctionAssociation.IncludeBody =
                event.cloudFront.includeBody
            }

            Object.assign(behavior, {
              TargetOriginId: origin.Id,
              LambdaFunctionAssociations: [lambdaFunctionAssociation],
            })

            if (pathPattern) {
              Object.assign(behavior, { PathPattern: pathPattern })
            }

            const existingBehaviour = behaviors.find(
              (o) =>
                o.PathPattern === behavior.PathPattern &&
                o.TargetOriginId === behavior.TargetOriginId,
            )

            if (!existingBehaviour) {
              behaviors.push(behavior)
            } else {
              behavior = extendDeep(existingBehaviour, behavior)
            }

            lambdaAtEdgeFunctions.push(
              Object.assign({}, functionObj, {
                functionName,
                lambdaVersionLogicalId,
              }),
            )
          }
        })
      }
    })

    unusedUserDefinedCachePolicies.forEach((unusedUserDefinedCachePolicy) => {
      log.warning(
        `Setting "provider.cloudFront.cachePolicies.${unusedUserDefinedCachePolicy}" is not used by any cloudFront event configuration.`,
      )
    })

    // sort that first is without PathPattern if available
    behaviors.sort((a, b) => {
      if (a.PathPattern && !b.PathPattern) {
        return 1
      }
      if (b.PathPattern && !a.PathPattern) {
        return -1
      }
      return 0
    })

    if (lambdaAtEdgeFunctions.length) {
      if (this.provider.getRegion() !== 'us-east-1') {
        throw new ServerlessError(
          'CloudFront associated functions have to be deployed to the us-east-1 region.',
          'CLOUDFRONT_INVALID_REGION',
        )
      }

      // Check if all behaviors got unique pathPatterns
      if (behaviors.length !== _.uniqBy(behaviors, 'PathPattern').length) {
        throw new ServerlessError(
          'Found more than one behavior with the same PathPattern',
          'CLOUDFRONT_MULTIPLE_BEHAVIORS_FOR_SINGLE_PATH_PATTERN',
        )
      }

      // Check if all event types in every behavior is unique
      if (
        behaviors.some((o) => {
          return (
            o.LambdaFunctionAssociations.length !==
            _.uniqBy(o.LambdaFunctionAssociations, 'EventType').length
          )
        })
      ) {
        throw new ServerlessError(
          'The event type of a function association must be unique in the cache behavior',
          'CLOUDFRONT_EVENT_TYPE_NON_UNIQUE_CACHE_BEHAVIOR',
        )
      }

      // DefaultCacheBehavior does not support PathPattern property
      if (behaviors[0].PathPattern) {
        let origin = defaultOrigin
        if (!origin) {
          if (origins.length > 1) {
            throw new ServerlessError(
              'Found more than one origin but none of the cloudfront event has "isDefaultOrigin" defined',
              'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS',
            )
          }
          origin = origins[0]
        }
        const behavior = _.omit(behaviors[0], [
          'PathPattern',
          'LambdaFunctionAssociations',
        ])
        behavior.TargetOriginId = origin.Id
        behaviors.unshift(behavior)
      }

      const lambdaInvokePermissions = lambdaAtEdgeFunctions.reduce(
        (permissions, lambdaAtEdgeFunction) => {
          const invokePermissionName =
            this.provider.naming.getLambdaAtEdgeInvokePermissionLogicalId(
              lambdaAtEdgeFunction.functionName,
            )
          const invokePermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                Ref: lambdaAtEdgeFunction.lambdaVersionLogicalId,
              },
              Action: 'lambda:InvokeFunction',
              Principal: 'edgelambda.amazonaws.com',
              SourceArn: {
                'Fn::Join': [
                  '',
                  [
                    '',
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':cloudfront::',
                    { Ref: 'AWS::AccountId' },
                    ':distribution/',
                    {
                      Ref: this.provider.naming.getCloudFrontDistributionLogicalId(),
                    },
                  ],
                ],
              },
            },
          }
          return Object.assign(permissions, {
            [invokePermissionName]: invokePermission,
          })
        },
        {},
      )

      Object.assign(Resources, lambdaInvokePermissions)

      if (!Resources.IamRoleLambdaExecution) {
        log.notice(
          `Remember to add required lambda@edge permissions to your execution role. Documentation: ${style.link(
            'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html',
          )}`,
        )
      } else {
        const lambdaAssumeStatement =
          Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement.find(
            (statement) =>
              statement.Principal.Service.includes('lambda.amazonaws.com'),
          )
        if (lambdaAssumeStatement) {
          lambdaAssumeStatement.Principal.Service.push(
            'edgelambda.amazonaws.com',
          )
        }

        // Lambda creates CloudWatch Logs log streams
        // in the CloudWatch Logs regions closest
        // to the locations where the function is executed.
        // The format of the name for each log stream is
        // /aws/lambda/us-east-1.function-name where
        // function-name is the name that you gave
        // to the function when you created it.
        Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.push(
          {
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
              'logs:TagResource',
            ],
            Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:logs:*:*:*' }],
          },
        )
      }

      const CacheBehaviors = behaviors.slice(1)

      const CloudFrontDistribution = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Comment: `${
              this.serverless.service.service
            } ${this.provider.getStage()}`,
            Enabled: true,
            DefaultCacheBehavior: behaviors[0],
            Origins: origins,
          },
        },
      }

      if (CacheBehaviors.length > 0) {
        Object.assign(CloudFrontDistribution.Properties.DistributionConfig, {
          CacheBehaviors,
        })
      }

      Object.assign(Resources, {
        [this.cloudFrontDistributionLogicalId]: CloudFrontDistribution,
      })

      _.merge(Outputs, {
        [this.cloudFrontDistributionLogicalId]: {
          Description: 'CloudFront Distribution Id',
          Value: {
            Ref: this.provider.naming.getCloudFrontDistributionLogicalId(),
          },
        },
        [this.cloudFrontDistributionDomainNameLogicalId]: {
          Description: 'CloudFront Distribution Domain Name',
          Value: {
            'Fn::GetAtt': [
              this.provider.naming.getCloudFrontDistributionLogicalId(),
              'DomainName',
            ],
          },
        },
      })
    }
  }
}

export default AwsCompileCloudFrontEvents
