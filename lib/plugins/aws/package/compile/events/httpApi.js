'use strict';

const _ = require('lodash');
const d = require('d');
const memoizee = require('memoizee');
const memoizeeMethods = require('memoizee/methods');
const ServerlessError = require('../../../../../serverless-error');
const { logWarning } = require('../../../../../classes/Error');
const resolveLambdaTarget = require('../../../utils/resolveLambdaTarget');

const allowedMethods = new Set(['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE']);
const methodPattern = new RegExp(`^(?:\\*|${Array.from(allowedMethods).join('|')})$`, 'i');
const methodPathPattern = new RegExp(
  `^(?:\\*|(${Array.from(allowedMethods).join('|')}) (\\/\\S*))$`,
  'i'
);

const resolveTargetConfig = memoizee(({ functionLogicalId, functionAlias }) => {
  const functionArnGetter = { 'Fn::GetAtt': [functionLogicalId, 'Arn'] };
  if (!functionAlias) return functionArnGetter;
  return { 'Fn::Join': [':', [functionArnGetter, functionAlias.name]] };
});

const defaultCors = {
  allowedOrigins: new Set(['*']),
  allowedHeaders: new Set([
    'Content-Type',
    'X-Amz-Date',
    'Authorization',
    'X-Api-Key',
    'X-Amz-Security-Token',
    'X-Amz-User-Agent',
  ]),
};

const toSet = (item) => new Set(Array.isArray(item) ? item : [item]);

class HttpApiEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    serverless.httpApiEventsPlugin = this;

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.service.provider.name === 'aws' &&
          this.serverless.service.provider.tags &&
          !_.get(this.serverless.service.provider.httpApi, 'useProviderTags') &&
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some(({ httpApi }) => httpApi)
          )
        ) {
          this.serverless._logDeprecation(
            'AWS_HTTP_API_USE_PROVIDER_TAGS',
            'Starting with next major version, the provider tags ' +
              'will be applied to Http Api Gateway by default. \n' +
              'Set "provider.httpApi.useProviderTags" to "true" ' +
              'to adapt to the new behavior now.'
          );
        }
      },
      'package:compileEvents': () => {
        this.resolveConfiguration();
        if (!this.config.routes.size) return;
        this.cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
        this.compileApi();
        this.compileLogGroup();
        this.compileStage();
        this.compileAuthorizers();
        this.compileEndpoints();
      },
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'httpApi', {
      anyOf: [
        { type: 'string', regexp: methodPathPattern.toString() },
        {
          type: 'object',
          properties: {
            authorizer: {
              anyOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    id: {
                      anyOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfFunction' }],
                    },
                    name: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string' } },
                    type: { type: 'string', enum: ['request', 'jwt', 'aws_iam'] },
                  },
                  anyOf: [{ required: ['id'] }, { required: ['name'] }, { required: ['type'] }],
                  additionalProperties: false,
                },
              ],
            },
            method: { type: 'string', regexp: methodPattern.toString() },
            path: { type: 'string', regexp: /^(?:\*|\/\S*)$/.toString() },
          },
          required: ['path'],
          additionalProperties: false,
        },
      ],
    });
  }
  getApiIdConfig() {
    return this.config.id || { Ref: this.provider.naming.getHttpApiLogicalId() };
  }
  compileApi() {
    if (this.config.id) return;
    const properties = {
      Name: this.provider.naming.getHttpApiName(),
      ProtocolType: 'HTTP',
      DisableExecuteApiEndpoint:
        this.config.disableDefaultEndpoint == null ? undefined : this.config.disableDefaultEndpoint,
    };
    if (
      this.serverless.service.provider.tags &&
      this.serverless.service.provider.httpApi &&
      this.serverless.service.provider.httpApi.useProviderTags
    ) {
      const tags = Object.assign({}, this.serverless.service.provider.tags);
      properties.Tags = tags;
    }
    const cors = this.config.cors;
    if (cors) {
      properties.CorsConfiguration = {
        AllowCredentials: cors.allowCredentials,
        AllowHeaders: Array.from(cors.allowedHeaders),
        AllowMethods: Array.from(cors.allowedMethods),
        AllowOrigins: Array.from(cors.allowedOrigins),
        ExposeHeaders: cors.exposedResponseHeaders && Array.from(cors.exposedResponseHeaders),
        MaxAge: cors.maxAge,
      };
    }
    this.cfTemplate.Resources[this.provider.naming.getHttpApiLogicalId()] = {
      Type: 'AWS::ApiGatewayV2::Api',
      Properties: properties,
    };
  }
  compileLogGroup() {
    if (!this.config.accessLogFormat) return;

    const resource = {
      Type: 'AWS::Logs::LogGroup',
      Properties: { LogGroupName: this.provider.naming.getHttpApiLogGroupName() },
    };

    const logRetentionInDays = this.provider.getLogRetentionInDays();
    if (logRetentionInDays) {
      resource.Properties.RetentionInDays = logRetentionInDays;
    }

    this.cfTemplate.Resources[this.provider.naming.getHttpApiLogGroupLogicalId()] = resource;
  }
  compileStage() {
    if (this.config.id) return;
    const properties = {
      ApiId: { Ref: this.provider.naming.getHttpApiLogicalId() },
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: {
        DetailedMetricsEnabled: this.config.metrics,
      },
    };

    if (
      this.serverless.service.provider.tags &&
      this.serverless.service.provider.httpApi &&
      this.serverless.service.provider.httpApi.useProviderTags
    ) {
      properties.Tags = Object.assign({}, this.serverless.service.provider.tags);
    }

    const resource = (this.cfTemplate.Resources[this.provider.naming.getHttpApiStageLogicalId()] = {
      Type: 'AWS::ApiGatewayV2::Stage',
      Properties: properties,
    });
    if (this.config.accessLogFormat) {
      properties.AccessLogSettings = {
        DestinationArn: {
          'Fn::GetAtt': [this.provider.naming.getHttpApiLogGroupLogicalId(), 'Arn'],
        },
        Format: this.config.accessLogFormat,
      };
      resource.DependsOn = this.provider.naming.getHttpApiLogGroupLogicalId();
    }
    this.cfTemplate.Outputs.HttpApiId = {
      Description: 'Id of the HTTP API',
      Value: { Ref: this.provider.naming.getHttpApiLogicalId() },
    };
    this.cfTemplate.Outputs.HttpApiUrl = {
      Description: 'URL of the HTTP API',
      Value: {
        'Fn::Join': [
          '',
          [
            'https://',
            { Ref: this.provider.naming.getHttpApiLogicalId() },
            '.execute-api.',
            { Ref: 'AWS::Region' },
            '.',
            { Ref: 'AWS::URLSuffix' },
          ],
        ],
      },
    };
  }
  compileAuthorizers() {
    for (const authorizer of this.config.authorizers.values()) {
      const authorizerLogicalId = this.provider.naming.getHttpApiAuthorizerLogicalId(
        authorizer.name
      );

      const authorizerResource = {
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: this.getApiIdConfig(),
          Name: authorizer.name,
          IdentitySource: Array.isArray(authorizer.identitySource)
            ? authorizer.identitySource
            : [authorizer.identitySource],
        },
      };

      if (authorizer.type === 'request') {
        // Compile custom (request) authorizer
        authorizerResource.Properties.AuthorizerType = 'REQUEST';
        authorizerResource.Properties.EnableSimpleResponses = authorizer.enableSimpleResponses;
        authorizerResource.Properties.AuthorizerResultTtlInSeconds = authorizer.resultTtlInSeconds;
        authorizerResource.Properties.AuthorizerPayloadFormatVersion = authorizer.payloadVersion;
        authorizerResource.Properties.AuthorizerUri = {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              authorizer.functionArn ||
                resolveLambdaTarget(authorizer.functionName, authorizer.functionObject),
              '/invocations',
            ],
          ],
        };

        // If authorizer is not managed externally, we need to make sure the correct permission is created that
        // allows API Gateway to invoke authorizer function
        if (!authorizer.managedExternally) {
          this.compileAuthorizerLambdaPermission(authorizer);
        }
      } else {
        // Compile JWT Authorizer
        authorizerResource.Properties.AuthorizerType = 'JWT';
        authorizerResource.Properties.JwtConfiguration = {
          Audience: Array.from(authorizer.audience),
          Issuer: authorizer.issuerUrl,
        };
      }

      this.cfTemplate.Resources[authorizerLogicalId] = authorizerResource;
    }
  }

  compileAuthorizerLambdaPermission({ functionName, functionArn, name, functionObject }) {
    const authorizerPermissionLogicalId =
      this.provider.naming.getLambdaAuthorizerHttpApiPermissionLogicalId(name);
    const permissionResource = {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: functionArn || resolveLambdaTarget(functionName, functionObject),
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':execute-api:',
              { Ref: 'AWS::Region' },
              ':',
              { Ref: 'AWS::AccountId' },
              ':',
              this.getApiIdConfig(),
              '/*',
            ],
          ],
        },
      },
    };

    if (functionObject && functionObject.targetAlias) {
      permissionResource.DependsOn = functionObject.targetAlias.logicalId;
    }
    this.cfTemplate.Resources[authorizerPermissionLogicalId] = permissionResource;
  }

  compileEndpoints() {
    for (const [routeKey, { targetData, authorizer, authorizationScopes }] of this.config.routes) {
      this.compileLambdaPermissions(targetData);
      this.compileIntegration(targetData);
      const resource = (this.cfTemplate.Resources[
        this.provider.naming.getHttpApiRouteLogicalId(routeKey)
      ] = {
        Type: 'AWS::ApiGatewayV2::Route',
        Properties: {
          ApiId: this.getApiIdConfig(),
          RouteKey: routeKey === '*' ? '$default' : routeKey,
          Target: {
            'Fn::Join': [
              '/',
              [
                'integrations',
                {
                  Ref: this.provider.naming.getHttpApiIntegrationLogicalId(targetData.functionName),
                },
              ],
            ],
          },
        },
        DependsOn: this.provider.naming.getHttpApiIntegrationLogicalId(targetData.functionName),
      });
      if (authorizer) {
        const { id, type } = authorizer;

        const authorizationType = (() => {
          if (type === 'request') {
            return 'CUSTOM';
          }

          if (type === 'aws_iam') {
            return 'AWS_IAM';
          }

          return 'JWT';
        })();

        resource.Properties.AuthorizationType = authorizationType;

        if (type !== 'aws_iam') {
          Object.assign(resource.Properties, {
            AuthorizerId: id || {
              Ref: this.provider.naming.getHttpApiAuthorizerLogicalId(authorizer.name),
            },
            AuthorizationScopes: authorizationScopes && Array.from(authorizationScopes),
          });
        }
      }
    }
  }
}

Object.defineProperties(
  HttpApiEvents.prototype,
  memoizeeMethods({
    resolveConfiguration: d(function () {
      const routes = new Map();
      const providerConfig = this.serverless.service.provider;
      const userConfig = providerConfig.httpApi || {};
      this.config = {
        routes,
        id: userConfig.id,
        metrics: userConfig.metrics || false,
        disableDefaultEndpoint: userConfig.disableDefaultEndpoint,
      };
      let cors = null;
      let shouldFillCorsMethods = false;
      const userCors = userConfig.cors;
      if (userCors) {
        if (userConfig.id) {
          throw new ServerlessError(
            'Cannot setup CORS rules for externally configured HTTP API',
            'EXTERNAL_HTTP_API_CORS_CONFIG'
          );
        }
        cors = this.config.cors = {};
        if (userConfig.cors === true) {
          Object.assign(cors, defaultCors);
          shouldFillCorsMethods = true;
        } else {
          cors.allowedOrigins = userCors.allowedOrigins
            ? toSet(userCors.allowedOrigins)
            : defaultCors.allowedOrigins;
          cors.allowedHeaders = userCors.allowedHeaders
            ? toSet(userCors.allowedHeaders)
            : defaultCors.allowedHeaders;
          if (userCors.allowedMethods) cors.allowedMethods = toSet(userCors.allowedMethods);
          else shouldFillCorsMethods = true;
          if (userCors.allowCredentials) cors.allowCredentials = true;
          if (userCors.exposedResponseHeaders) {
            cors.exposedResponseHeaders = toSet(userCors.exposedResponseHeaders);
          }
          cors.maxAge = userCors.maxAge;
        }
        if (shouldFillCorsMethods) cors.allowedMethods = new Set(['OPTIONS']);
      }

      const userAuthorizers = userConfig.authorizers;
      const authorizers = (this.config.authorizers = new Map());
      if (userAuthorizers) {
        if (userConfig.id) {
          throw new ServerlessError(
            'Cannot setup authorizers for externally configured HTTP API',
            'EXTERNAL_HTTP_API_AUTHORIZERS_CONFIG'
          );
        }
        for (const [name, authorizerConfig] of Object.entries(userAuthorizers)) {
          let authorizerFunctionObject;

          if (authorizerConfig.type === 'request') {
            if (!authorizerConfig.functionArn && !authorizerConfig.functionName) {
              throw new ServerlessError(
                `Either "functionArn" or "functionName" property needs to be set on authorizer "${name}"`,
                'HTTP_API_CUSTOM_AUTHORIZER_NEITHER_FUNCTION_ARN_NOR_FUNCTION_NAME_DEFINED'
              );
            }

            if (authorizerConfig.functionArn && authorizerConfig.functionName) {
              throw new ServerlessError(
                `Either "functionArn" or "functionName" (not both) property needs to be set on authorizer "${name}"`,
                'HTTP_API_CUSTOM_AUTHORIZER_BOTH_FUNCTION_ARN_AND_FUNCTION_NAME_DEFINED'
              );
            }

            if (authorizerConfig.functionName) {
              try {
                authorizerFunctionObject = this.serverless.service.getFunction(
                  authorizerConfig.functionName
                );
              } catch {
                throw new ServerlessError(
                  `Function "${authorizerConfig.functionName}" for HTTP API authorizer "${name}" not found in service.`,
                  'HTTP_API_CUSTOM_AUTHORIZER_FUNCTION_NOT_FOUND_IN_SERVICE'
                );
              }
            }

            if (authorizerConfig.resultTtlInSeconds && !authorizerConfig.identitySource) {
              throw new ServerlessError(
                `Property "identitySource" has to be set on authorizer "${name}" when "resultTtlInSeconds" is set to non-zero value.`,
                'HTTP_API_CUSTOM_AUTHORIZER_IDENTITY_SOURCE_MISSING_WHEN_CACHING_ENABLED'
              );
            }
          }

          authorizers.set(name, {
            name: authorizerConfig.name || name,
            identitySource: authorizerConfig.identitySource || [],
            issuerUrl: authorizerConfig.issuerUrl,
            audience: toSet(authorizerConfig.audience),
            type: authorizerConfig.type,
            functionName: authorizerConfig.functionName,
            functionArn: authorizerConfig.functionArn,
            managedExternally: authorizerConfig.managedExternally,
            resultTtlInSeconds: authorizerConfig.resultTtlInSeconds,
            enableSimpleResponses: authorizerConfig.enableSimpleResponses,
            payloadVersion: authorizerConfig.payloadVersion || '2.0',
            functionObject: authorizerFunctionObject,
          });
        }
      }

      const userLogsConfig = providerConfig.logs && providerConfig.logs.httpApi;
      if (userLogsConfig) {
        if (userConfig.id) {
          throw new ServerlessError(
            'Cannot setup access logs for externally configured HTTP API',
            'EXTERNAL_HTTP_API_LOGS_CONFIG'
          );
        }
        this.config.accessLogFormat =
          userLogsConfig.format ||
          `${JSON.stringify({
            requestId: '$context.requestId',
            ip: '$context.identity.sourceIp',
            requestTime: '$context.requestTime',
            httpMethod: '$context.httpMethod',
            routeKey: '$context.routeKey',
            status: '$context.status',
            protocol: '$context.protocol',
            responseLength: '$context.responseLength',
          })}`;
      }

      for (const [functionName, functionData] of Object.entries(
        this.serverless.service.functions
      )) {
        const routeTargetData = {
          functionName,
          functionAlias: functionData.targetAlias,
          functionLogicalId: this.provider.naming.getLambdaLogicalId(functionName),
        };
        let hasHttpApiEvents = false;
        for (const event of functionData.events) {
          if (!event.httpApi) continue;
          hasHttpApiEvents = true;
          let method;
          let path;
          let authorizer;
          if (_.isObject(event.httpApi)) {
            ({ method, path, authorizer } = event.httpApi);
          } else {
            const methodPath = String(event.httpApi);
            if (methodPath === '*') {
              path = '*';
            } else {
              [, method, path] = methodPath.match(methodPathPattern);
            }
          }
          path = String(path);
          let routeKey;
          if (path === '*') {
            if (method && method !== '*') {
              throw new ServerlessError(
                `Invalid "path" property in function ${functionName} for httpApi event in serverless.yml`,
                'INVALID_HTTP_API_PATH'
              );
            }
            routeKey = '*';
            event.resolvedMethod = 'ANY';
          } else {
            if (!method) {
              throw new ServerlessError(
                `Missing "method" property in function ${functionName} for httpApi event in serverless.yml`,
                'MISSING_HTTP_API_METHOD'
              );
            }
            method = String(method).toUpperCase();
            if (method === '*') {
              method = 'ANY';
            } else if (!allowedMethods.has(method)) {
              throw new ServerlessError(
                `Invalid "method" property in function ${functionName} for httpApi event in serverless.yml`,
                'INVALID_HTTP_API_METHOD'
              );
            }
            event.resolvedMethod = method;
            event.resolvedPath = path;
            routeKey = `${method} ${path}`;

            if (routes.has(routeKey)) {
              throw new ServerlessError(
                `Duplicate route '${routeKey}' configuration in function ${functionName} for httpApi event in serverless.yml`,
                'DUPLICATE_HTTP_API_ROUTE'
              );
            }
          }
          const routeConfig = { targetData: routeTargetData };
          if (authorizer) {
            const { name, scopes, id, type } = (() => {
              if (_.isObject(authorizer)) return authorizer;
              return { name: authorizer };
            })();

            if (type !== 'aws_iam' && !id && !name) {
              throw new ServerlessError(
                `When configuring an authorizer with type: "${
                  type || 'jwt'
                }", property "id" or "name" has to be specified.`,
                'HTTP_API_AUTHORIZER_MISSING_ID_OR_NAME'
              );
            }

            if (type === 'aws_iam' && (name || id || scopes)) {
              throw new ServerlessError(
                'When configuring authorizer with type: "aws_iam", all other properties are not supported.',
                'HTTP_API_AUTHORIZER_AWS_IAM_UNEXPECTED_PROPERTIES'
              );
            }

            if (id) {
              if (!userConfig.id) {
                throw new ServerlessError(
                  `Event references external authorizer '${id}', but httpApi is part of the current stack.`,
                  'EXTERNAL_HTTP_API_AUTHORIZER_WITHOUT_EXTERNAL_HTTP_API'
                );
              }
              routeConfig.authorizer = { id, type };
            } else if (type === 'aws_iam') {
              routeConfig.authorizer = authorizer;
            } else if (!authorizers.has(name)) {
              throw new ServerlessError(
                `Event references not configured authorizer '${name}'`,
                'UNRECOGNIZED_HTTP_API_AUTHORIZER'
              );
            } else {
              routeConfig.authorizer = authorizers.get(name);
            }
            if (scopes) routeConfig.authorizationScopes = toSet(scopes);
          }
          routes.set(routeKey, routeConfig);
          if (shouldFillCorsMethods) {
            if (event.resolvedMethod === 'ANY') {
              for (const allowedMethod of allowedMethods) {
                if (allowedMethod === 'ANY') {
                  continue;
                }
                cors.allowedMethods.add(allowedMethod);
              }
            } else {
              cors.allowedMethods.add(event.resolvedMethod);
            }
          }
        }
        if (!hasHttpApiEvents) continue;
        const functionTimeout =
          Number(functionData.timeout) || Number(this.serverless.service.provider.timeout) || 6;

        if (functionTimeout > 29) {
          logWarning(
            `Function (${functionName}) timeout setting (${functionTimeout}) is greater than ` +
              'maximum allowed timeout for HTTP API endpoint (29s). ' +
              'This may introduce a situation where endpoint times out ' +
              'for a succesful lambda invocation.'
          );
        } else if (functionTimeout === 29) {
          logWarning(
            `Function (${functionName}) timeout setting (${functionTimeout}) may not provide ` +
              'enough room to process an HTTP API request (of which timeout is limited to 29s). ' +
              'This may introduce a situation where endpoint times out ' +
              'for a succesful lambda invocation.'
          );
        }
        // Ensure endpoint has slightly larger timeout than a function,
        // It's a margin needed for some side processing time on AWS side.
        // Otherwise there's a risk of observing 503 status for successfully resolved invocation
        // (which just fit function timeout setting)
        routeTargetData.timeout = Math.min(functionTimeout + 0.5, 29);
      }
    }),
    compileIntegration: d(function (routeTargetData) {
      const functionConfig = this.serverless.service.getFunction(routeTargetData.functionName);
      const funcHttpApi = functionConfig.httpApi || {};
      const providerConfig = this.serverless.service.provider;
      const providerHttpApi = providerConfig.httpApi || {};

      const properties = {
        ApiId: this.getApiIdConfig(),
        IntegrationType: 'AWS_PROXY',
        IntegrationUri: resolveTargetConfig(routeTargetData),
        PayloadFormatVersion: funcHttpApi.payload || providerHttpApi.payload || '2.0',
      };
      if (routeTargetData.timeout) {
        properties.TimeoutInMillis = Math.round(routeTargetData.timeout * 1000);
      }
      this.cfTemplate.Resources[
        this.provider.naming.getHttpApiIntegrationLogicalId(routeTargetData.functionName)
      ] = {
        Type: 'AWS::ApiGatewayV2::Integration',
        Properties: properties,
      };
    }),
    compileLambdaPermissions: d(function (routeTargetData) {
      this.cfTemplate.Resources[
        this.provider.naming.getLambdaHttpApiPermissionLogicalId(routeTargetData.functionName)
      ] = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: resolveTargetConfig(routeTargetData),
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':execute-api:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':',
                this.getApiIdConfig(),
                '/*',
              ],
            ],
          },
        },
        DependsOn: routeTargetData.functionAlias
          ? routeTargetData.functionAlias.logicalId
          : undefined,
      };
    }),
  })
);

module.exports = HttpApiEvents;
