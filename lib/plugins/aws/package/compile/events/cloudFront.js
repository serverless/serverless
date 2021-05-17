'use strict';

const _ = require('lodash');
const url = require('url');
const chalk = require('chalk');
const ServerlessError = require('../../../../../serverless-error');

const originLimits = { maxTimeout: 30, maxMemorySize: 10240 };
const viewerLimits = { maxTimeout: 5, maxMemorySize: 128 };

class AwsCompileCloudFrontEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.lambdaEdgeLimits = {
      'origin-request': originLimits,
      'origin-response': originLimits,
      'viewer-request': viewerLimits,
      'viewer-response': viewerLimits,
      'default': viewerLimits,
    };
    this.cachePolicies = new Set();

    const originObjectSchema = {
      type: 'object',
      properties: {
        ConnectionAttempts: { type: 'integer', miminum: 1, maximum: 3 },
        ConnectionTimeout: { type: 'integer', miminum: 1, maximum: 10 },
        CustomOriginConfig: {
          type: 'object',
          properties: {
            HTTPPort: { type: 'integer', miminum: 0, maximum: 65535 },
            HTTPSPort: { type: 'integer', miminum: 0, maximum: 65535 },
            OriginKeepaliveTimeout: { type: 'integer', miminum: 1, maximum: 60 },
            OriginProtocolPolicy: {
              enum: ['http-only', 'match-viewer', 'https-only'],
            },
            OriginReadTimeout: { type: 'integer', miminum: 1, maximum: 60 },
            OriginSSLProtocols: {
              type: 'array',
              items: { enum: ['SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2'] },
            },
          },
          additionalProperties: false,
          required: ['OriginProtocolPolicy'],
        },
        DomainName: {
          anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
        },
        OriginCustomHeaders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              HeaderName: { type: 'string' },
              HeaderValue: { type: 'string' },
            },
            additionalProperties: false,
            required: ['HeaderName', 'HeaderValue'],
          },
        },
        OriginPath: { type: 'string' },
        S3OriginConfig: {
          type: 'object',
          properties: {
            OriginAccessIdentity: {
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
      oneOf: [{ required: ['CustomOriginConfig'] }, { required: ['S3OriginConfig'] }],
    };

    const behaviorObjectSchema = {
      type: 'object',
      properties: {
        AllowedMethods: {
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
              items: { enum: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'] },
            },
          ],
        },
        CachedMethods: {
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
        ForwardedValues: {
          type: 'object',
          properties: {
            Cookies: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    Forward: { enum: ['all', 'none'] },
                  },
                  additionalProperties: false,
                  required: ['Forward'],
                },
                {
                  type: 'object',
                  properties: {
                    Forward: { const: 'whitelist' },
                    WhitelistedNames: { type: 'array', items: { type: 'string' } },
                  },
                  additionalProperties: false,
                  required: ['Forward', 'WhitelistedNames'],
                },
              ],
            },
            Headers: { type: 'array', items: { type: 'string' } },
            QueryString: { type: 'boolean' },
            QueryStringCacheKeys: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
          required: ['QueryString'],
        },
        CachePolicyId: { type: 'string' },
        Compress: { type: 'boolean' },
        FieldLevelEncryptionId: { type: 'string' },
        OriginRequestPolicyId: { type: 'string' },
        SmoothStreaming: { type: 'boolean' },
        TrustedSigners: { type: 'array', items: { type: 'string' } },
        ViewerProtocolPolicy: {
          enum: ['allow-all', 'redirect-to-https', 'https-only'],
        },
      },
      additionalProperties: false,
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'cloudFront', {
      type: 'object',
      properties: {
        behavior: behaviorObjectSchema,
        cachePolicy: {
          type: 'object',
          properties: {
            id: { $ref: '#/definitions/awsCfInstruction' },
            name: { type: 'string', minLength: 1 },
          },
          oneOf: [{ required: ['id'] }, { required: ['name'] }],
          additionalProperties: false,
        },
        eventType: {
          enum: ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'],
        },
        isDefaultOrigin: { type: 'boolean' },
        includeBody: { type: 'boolean' },
        origin: {
          anyOf: [{ type: 'string', format: 'uri' }, originObjectSchema],
        },
        // Allowed characters reference:
        // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesPathPattern
        // Still note it doesn't reference "?" character, which appears in prior examples,
        // Hence it's now included in this regex
        pathPattern: { type: 'string', pattern: '^([A-Za-z0-9_.*?$/~"\'@:+-]|&amp;)+$' },
      },
      additionalProperties: false,
    });

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.service.provider.name === 'aws' &&
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some(({ cloudFront: eventObject }) => {
              const behaviorConfig = eventObject && eventObject.behavior;
              if (!behaviorConfig) return false;
              return (
                behaviorConfig.ForwardedValues ||
                behaviorConfig.MinTTL !== undefined ||
                behaviorConfig.MaxTTL !== undefined ||
                behaviorConfig.DefaultTTL !== undefined
              );
            })
          )
        ) {
          this.serverless._logDeprecation(
            'CLOUDFRONT_CACHE_BEHAVIOR_FORWARDED_VALUES_AND_TTL',
            'Cloudfront has deprecated the use of the ForwardedValues, MinTTL, MaxTTL' +
              'and DefaultTTL field to configure cache behavior.' +
              'Please use "provider.cloudfront.cachePolicies" to define Cache Policies' +
              'and reference it here with "cachePolicy.name" property.' +
              'You can also reference existing policies with "cachePolicy.id".'
          );
        }
      },
      'package:initialize': this.validate.bind(this),
      'before:package:compileFunctions': this.prepareFunctions.bind(this),
      'package:compileEvents': () => {
        this.compileCloudFrontCachePolicies();
        this.compileCloudFrontEvents();
      },
      'before:remove:remove': this.logRemoveReminder.bind(this),
    };
  }

  logRemoveReminder() {
    if (this.serverless.processedInput.commands[0] === 'remove') {
      let isEventUsed = false;
      const funcKeys = this.serverless.service.getAllFunctions();
      if (funcKeys.length) {
        isEventUsed = funcKeys.some((funcKey) => {
          const func = this.serverless.service.getFunction(funcKey);
          return func.events && func.events.find((e) => Object.keys(e)[0] === 'cloudFront');
        });
      }
      if (isEventUsed) {
        const message = [
          "Don't forget to manually remove your Lambda@Edge functions ",
          'once the CloudFront distribution removal is successfully propagated!',
        ].join('');
        this.serverless.cli.log(message, 'Serverless', { color: 'orange' });
      }
    }
  }

  validate() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      functionObj.events.forEach(({ cloudFront }) => {
        if (!cloudFront) return;
        const { eventType = 'default' } = cloudFront;
        const { maxMemorySize, maxTimeout } = this.lambdaEdgeLimits[eventType];
        if (functionObj.memorySize && functionObj.memorySize > maxMemorySize) {
          throw new ServerlessError(
            `"${functionName}" memorySize is greater than ${maxMemorySize} which is not supported by Lambda@Edge functions of type "${eventType}"`,
            'LAMBDA_EDGE_UNSUPPORTED_MEMORY_SIZE'
          );
        }
        if (functionObj.timeout && functionObj.timeout > maxTimeout) {
          throw new ServerlessError(
            `"${functionName}" timeout is greater than ${maxTimeout} which is not supported by Lambda@Edge functions of type "${eventType}"`,
            'LAMBDA_EDGE_UNSUPPORTED_TIMEOUT_VALUE'
          );
        }
      });
    });
  }

  prepareFunctions() {
    // Lambda@Edge functions need to be versioned
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events.find((event) => event.cloudFront)) {
        // ensure that functions are versioned
        Object.assign(functionObj, { versionFunction: true });
        // set the maximum memory size if not explicitly configured
        if (!functionObj.memorySize) {
          Object.assign(functionObj, { memorySize: 128 });
        }
        // set the maximum timeout if not explicitly configured
        if (!functionObj.timeout) {
          Object.assign(functionObj, { timeout: 5 });
        }
      }
    });
  }

  compileCloudFrontCachePolicies() {
    const userConfig = this.serverless.service.provider.cloudFront || {};
    if (userConfig.cachePolicies) {
      const Resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      for (const [name, cachePolicyConfig] of Object.entries(userConfig.cachePolicies)) {
        this.cachePolicies.add(name);

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
        });
      }
    }
  }

  compileCloudFrontEvents() {
    this.cloudFrontDistributionLogicalId =
      this.provider.naming.getCloudFrontDistributionLogicalId();

    this.cloudFrontDistributionDomainNameLogicalId =
      this.provider.naming.getCloudFrontDistributionDomainNameLogicalId();

    const lambdaAtEdgeFunctions = [];

    const origins = [];
    const behaviors = [];
    let defaultOrigin;

    const Resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    const Outputs = this.serverless.service.provider.compiledCloudFormationTemplate.Outputs;

    // helper function for joining origins and behaviors
    function extendDeep(object, source) {
      return _.assignWith(object, source, (a, b) => {
        if (Array.isArray(a)) {
          return _.uniqWith(a.concat(b), _.isEqual);
        }
        if (_.isObject(a)) {
          extendDeep(a, b);
        }
        return a;
      });
    }

    function createOrigin(origin, naming) {
      const originObj = {};
      if (typeof origin === 'string') {
        const originUrl = url.parse(origin);
        Object.assign(originObj, {
          DomainName: originUrl.hostname,
        });

        if (originUrl.pathname && originUrl.pathname.length > 1) {
          Object.assign(originObj, { OriginPath: originUrl.pathname });
        }

        if (originUrl.protocol === 's3:') {
          Object.assign(originObj, { S3OriginConfig: {} });
        } else {
          Object.assign(originObj, {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'match-viewer',
            },
          });
        }
      } else {
        Object.assign(originObj, origin);
      }

      Object.assign(originObj, {
        Id: naming.getCloudFrontOriginId(originObj),
      });
      return originObj;
    }

    const unusedUserDefinedCachePolicies = new Set(this.cachePolicies);
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cloudFront) {
            const lambdaFunctionLogicalId = Object.keys(Resources).find(
              (key) =>
                Resources[key].Type === 'AWS::Lambda::Function' &&
                Resources[key].Properties.FunctionName === functionObj.name
            );

            // Remove VPC & Env vars from lambda@Edge
            delete Resources[lambdaFunctionLogicalId].Properties.VpcConfig;
            delete Resources[lambdaFunctionLogicalId].Properties.Environment;

            // Retain Lambda@Edge functions to avoid issues when removing the CloudFormation stack
            Object.assign(Resources[lambdaFunctionLogicalId], { DeletionPolicy: 'Retain' });

            const lambdaVersionLogicalId = Object.keys(Resources).find((key) => {
              const resource = Resources[key];
              if (resource.Type !== 'AWS::Lambda::Version') return false;
              return _.get(resource, 'Properties.FunctionName.Ref') === lambdaFunctionLogicalId;
            });

            const pathPattern =
              typeof event.cloudFront.pathPattern === 'string'
                ? event.cloudFront.pathPattern
                : undefined;

            let origin = createOrigin(event.cloudFront.origin, this.provider.naming);
            const existingOrigin = origins.find((o) => o.Id === origin.Id);

            if (!existingOrigin) {
              origins.push(origin);
            } else {
              origin = extendDeep(existingOrigin, origin);
            }

            if (event.cloudFront.isDefaultOrigin) {
              if (defaultOrigin && defaultOrigin !== origin) {
                throw new ServerlessError(
                  'Found more than one cloudfront event with "isDefaultOrigin" defined',
                  'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS'
                );
              }
              defaultOrigin = origin;
            }

            let behavior = {
              ViewerProtocolPolicy: 'allow-all',
            };
            let shouldAssignCachePolicy = true;
            if (event.cloudFront.behavior) {
              if (
                event.cloudFront.behavior.ForwardedValues ||
                event.cloudFront.behavior.MinTTL !== undefined ||
                event.cloudFront.behavior.MaxTTL !== undefined ||
                event.cloudFront.behavior.DefaultTTL !== undefined
              ) {
                behavior.ForwardedValues = { QueryString: false };
                shouldAssignCachePolicy = false;
              }
              Object.assign(behavior, event.cloudFront.behavior);
            }

            if (event.cloudFront.cachePolicy) {
              if (!shouldAssignCachePolicy) {
                throw new ServerlessError(
                  'Both cachePolicy and deprecated fields ForwardedValues, MinTTL, MaxTTL' +
                    'and DefaultTTL found in function ${functionObj.name} configuration.' +
                    'Specifying a cachePolicy override those deprecated parameters.' +
                    'Please remove one of the cache behavior definition.',
                  'CACHE_POLICY_ID_AND_DEPRECATED_FIELDS_USED'
                );
              }
              const { id, name } = event.cloudFront.cachePolicy;
              if (name) {
                if (!this.cachePolicies.has(name)) {
                  throw new ServerlessError(
                    `Event references not configured cache policy '${name}'`,
                    'UNRECOGNIZED_CLOUDFRONT_CACHE_POLICY'
                  );
                }
                unusedUserDefinedCachePolicies.delete(name);
              }
              Object.assign(behavior, {
                CachePolicyId: id || {
                  Ref: this.provider.naming.getCloudFrontCachePolicyLogicalId(name),
                },
              });
              // Backward compatibilty - Assinging default cache policy only if none of the ForwardedValues, MinTTL, MaxTTL and DefaultTTL deprecated fields are defined.
            } else if (shouldAssignCachePolicy) {
              // Assigning default Managed-CachingOptimized Cache Policy.
              // See details at https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list
              Object.assign(behavior, {
                CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
              });
            }

            const lambdaFunctionAssociation = {
              EventType: event.cloudFront.eventType,
              LambdaFunctionARN: {
                Ref: lambdaVersionLogicalId,
              },
            };

            if (event.cloudFront.includeBody != null) {
              lambdaFunctionAssociation.IncludeBody = event.cloudFront.includeBody;
            }

            Object.assign(behavior, {
              TargetOriginId: origin.Id,
              LambdaFunctionAssociations: [lambdaFunctionAssociation],
            });

            if (pathPattern) {
              Object.assign(behavior, { PathPattern: pathPattern });
            }

            const existingBehaviour = behaviors.find(
              (o) =>
                o.PathPattern === behavior.PathPattern &&
                o.TargetOriginId === behavior.TargetOriginId
            );

            if (!existingBehaviour) {
              behaviors.push(behavior);
            } else {
              behavior = extendDeep(existingBehaviour, behavior);
            }

            lambdaAtEdgeFunctions.push(
              Object.assign({}, functionObj, { functionName, lambdaVersionLogicalId })
            );
          }
        });
      }
    });

    unusedUserDefinedCachePolicies.forEach((unusedUserDefinedCachePolicy) => {
      this.serverless.cli.log(
        `WARNING: provider.cloudFront.cachePolicies.${unusedUserDefinedCachePolicy} ` +
          'not used by any cloudFront event configuration'
      );
    });

    // sort that first is without PathPattern if available
    behaviors.sort((a, b) => {
      if (a.PathPattern && !b.PathPattern) {
        return 1;
      }
      if (b.PathPattern && !a.PathPattern) {
        return -1;
      }
      return 0;
    });

    if (lambdaAtEdgeFunctions.length) {
      if (this.provider.getRegion() !== 'us-east-1') {
        throw new ServerlessError(
          'CloudFront associated functions have to be deployed to the us-east-1 region.',
          'CLOUDFRONT_INVALID_REGION'
        );
      }

      // Check if all behaviors got unique pathPatterns
      if (behaviors.length !== _.uniqBy(behaviors, 'PathPattern').length) {
        throw new ServerlessError(
          'Found more than one behavior with the same PathPattern',
          'CLOUDFRONT_MULTIPLE_BEHAVIORS_FOR_SINGLE_PATH_PATTERN'
        );
      }

      // Check if all event types in every behavior is unique
      if (
        behaviors.some((o) => {
          return (
            o.LambdaFunctionAssociations.length !==
            _.uniqBy(o.LambdaFunctionAssociations, 'EventType').length
          );
        })
      ) {
        throw new ServerlessError(
          'The event type of a function association must be unique in the cache behavior',
          'CLOUDFRONT_EVENT_TYPE_NON_UNIQUE_CACHE_BEHAVIOR'
        );
      }

      // DefaultCacheBehavior does not support PathPattern property
      if (behaviors[0].PathPattern) {
        let origin = defaultOrigin;
        if (!origin) {
          if (origins.length > 1) {
            throw new ServerlessError(
              'Found more than one origin but none of the cloudfront event has "isDefaultOrigin" defined',
              'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS'
            );
          }
          origin = origins[0];
        }
        const behavior = _.omit(behaviors[0], ['PathPattern', 'LambdaFunctionAssociations']);
        behavior.TargetOriginId = origin.Id;
        behaviors.unshift(behavior);
      }

      const lambdaInvokePermissions = lambdaAtEdgeFunctions.reduce(
        (permissions, lambdaAtEdgeFunction) => {
          const invokePermissionName =
            this.provider.naming.getLambdaAtEdgeInvokePermissionLogicalId(
              lambdaAtEdgeFunction.functionName
            );
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
                    { Ref: this.provider.naming.getCloudFrontDistributionLogicalId() },
                  ],
                ],
              },
            },
          };
          return Object.assign(permissions, {
            [invokePermissionName]: invokePermission,
          });
        },
        {}
      );

      Object.assign(Resources, lambdaInvokePermissions);

      if (!Resources.IamRoleLambdaExecution) {
        this.serverless.cli.log(
          chalk.magenta('Remember to add required lambda@edge permissions to your execution role.')
        );
        this.serverless.cli.log(
          chalk.magenta(
            'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html'
          )
        );
      } else {
        const lambdaAssumeStatement =
          Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement.find(
            (statement) => statement.Principal.Service.includes('lambda.amazonaws.com')
          );
        if (lambdaAssumeStatement) {
          lambdaAssumeStatement.Principal.Service.push('edgelambda.amazonaws.com');
        }

        // Lambda creates CloudWatch Logs log streams
        // in the CloudWatch Logs regions closest
        // to the locations where the function is executed.
        // The format of the name for each log stream is
        // /aws/lambda/us-east-1.function-name where
        // function-name is the name that you gave
        // to the function when you created it.
        Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.push({
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:logs:*:*:*' }],
        });
      }

      const CacheBehaviors = behaviors.slice(1);

      const CloudFrontDistribution = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Comment: `${this.serverless.service.service} ${this.provider.getStage()}`,
            Enabled: true,
            DefaultCacheBehavior: behaviors[0],
            Origins: origins,
          },
        },
      };

      if (CacheBehaviors.length > 0) {
        Object.assign(CloudFrontDistribution.Properties.DistributionConfig, { CacheBehaviors });
      }

      Object.assign(Resources, { [this.cloudFrontDistributionLogicalId]: CloudFrontDistribution });

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
            'Fn::GetAtt': [this.provider.naming.getCloudFrontDistributionLogicalId(), 'DomainName'],
          },
        },
      });
    }
  }
}

module.exports = AwsCompileCloudFrontEvents;
