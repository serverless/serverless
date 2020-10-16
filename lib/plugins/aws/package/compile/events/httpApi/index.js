'use strict';

const _ = require('lodash');
const d = require('d');
const memoizee = require('memoizee');
const memoizeeMethods = require('memoizee/methods');
const { logWarning } = require('../../../../../../classes/Error');

const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE']);
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

const toSet = item => new Set(Array.isArray(item) ? item : [item]);

class HttpApiEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    serverless.httpApiEventsPlugin = this;

    this.hooks = {
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
                  },
                  oneOf: [{ required: ['id'] }, { required: ['name'] }],
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
    };
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
    };
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
      this.cfTemplate.Resources[
        this.provider.naming.getHttpApiAuthorizerLogicalId(authorizer.name)
      ] = {
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: this.getApiIdConfig(),
          AuthorizerType: 'JWT',
          IdentitySource: [authorizer.identitySource],
          JwtConfiguration: {
            Audience: Array.from(authorizer.audience),
            Issuer: authorizer.issuerUrl,
          },
          Name: authorizer.name,
        },
      };
    }
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
        const { id } = authorizer;
        Object.assign(resource.Properties, {
          AuthorizationType: 'JWT',
          AuthorizerId: id || {
            Ref: this.provider.naming.getHttpApiAuthorizerLogicalId(authorizer.name),
          },
          AuthorizationScopes: authorizationScopes && Array.from(authorizationScopes),
        });
      }
    }
  }
}

Object.defineProperties(
  HttpApiEvents.prototype,
  memoizeeMethods({
    resolveConfiguration: d(function() {
      const routes = new Map();
      const providerConfig = this.serverless.service.provider;
      const userConfig = providerConfig.httpApi || {};
      this.config = { routes, id: userConfig.id };
      let cors = null;
      let shouldFillCorsMethods = false;
      const userCors = userConfig.cors;
      if (userCors) {
        if (userConfig.id) {
          throw new this.serverless.classes.Error(
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
          throw new this.serverless.classes.Error(
            'Cannot setup authorizers for externally configured HTTP API',
            'EXTERNAL_HTTP_API_AUTHORIZERS_CONFIG'
          );
        }
        for (const [name, authorizerConfig] of Object.entries(userAuthorizers)) {
          authorizers.set(name, {
            name: authorizerConfig.name || name,
            identitySource: authorizerConfig.identitySource,
            issuerUrl: authorizerConfig.issuerUrl,
            audience: toSet(authorizerConfig.audience),
          });
        }
      }

      const userLogsConfig = providerConfig.logs && providerConfig.logs.httpApi;
      if (userLogsConfig) {
        if (userConfig.id) {
          throw new this.serverless.classes.Error(
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
              throw new this.serverless.classes.Error(
                `Invalid "path" property in function ${functionName} for httpApi event in serverless.yml`,
                'INVALID_HTTP_API_PATH'
              );
            }
            routeKey = '*';
            event.resolvedMethod = 'ANY';
          } else {
            if (!method) {
              throw new this.serverless.classes.Error(
                `Missing "method" property in function ${functionName} for httpApi event in serverless.yml`,
                'MISSING_HTTP_API_METHOD'
              );
            }
            method = String(method).toUpperCase();
            if (method === '*') {
              method = 'ANY';
              if (
                Array.from(
                  allowedMethods,
                  allowedMethod => `${allowedMethod} ${path}`
                ).some(duplicateRouteKey => routes.has(duplicateRouteKey))
              ) {
                throw new this.serverless.classes.Error(
                  `Duplicate method for "${path}" path in function ${functionName} for httpApi event in serverless.yml`,
                  'DUPLICATE_HTTP_API_METHOD'
                );
              }
            } else {
              if (!allowedMethods.has(method)) {
                throw new this.serverless.classes.Error(
                  `Invalid "method" property in function ${functionName} for httpApi event in serverless.yml`,
                  'INVALID_HTTP_API_METHOD'
                );
              }
              if (routes.has(`ANY ${path}`)) {
                throw new this.serverless.classes.Error(
                  `Duplicate method for "${path}" path in function ${functionName} for httpApi event in serverless.yml`,
                  'DUPLICATE_HTTP_API_METHOD'
                );
              }
            }
            event.resolvedMethod = method;
            event.resolvedPath = path;
            routeKey = `${method} ${path}`;

            if (routes.has(routeKey)) {
              throw new this.serverless.classes.Error(
                `Duplicate route '${routeKey}' configuration in function ${functionName} for httpApi event in serverless.yml`,
                'DUPLICATE_HTTP_API_ROUTE'
              );
            }
          }
          const routeConfig = { targetData: routeTargetData };
          if (authorizer) {
            const { name, scopes, id } = (() => {
              if (_.isObject(authorizer)) return authorizer;
              return { name: authorizer };
            })();
            if (id) {
              if (!userConfig.id) {
                throw new this.serverless.classes.Error(
                  `Event references external authorizer '${id}', but httpApi is part of the current stack.`,
                  'EXTERNAL_HTTP_API_AUTHORIZER_WITHOUT_EXTERNAL_HTTP_API'
                );
              }
              routeConfig.authorizer = { id };
            } else if (!authorizers.has(name)) {
              throw new this.serverless.classes.Error(
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
    compileIntegration: d(function(routeTargetData) {
      const providerConfig = this.serverless.service.provider;
      const userConfig = providerConfig.httpApi || {};

      const properties = {
        ApiId: this.getApiIdConfig(),
        IntegrationType: 'AWS_PROXY',
        IntegrationUri: resolveTargetConfig(routeTargetData),
        PayloadFormatVersion: userConfig.payload || '2.0',
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
    compileLambdaPermissions: d(function(routeTargetData) {
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
