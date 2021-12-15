'use strict';

const _ = require('lodash');
const awsArnRegExs = require('../../../../../utils/arnRegularExpressions');
const resolveLambdaTarget = require('../../../../../utils/resolveLambdaTarget');
const ServerlessError = require('../../../../../../../serverless-error');
const { legacy, log } = require('@serverless/utils/log');

const NOT_FOUND = -1;
const DEFAULT_STATUS_CODES = {
  200: {
    pattern: '',
  },
  400: {
    pattern: '[\\s\\S]*\\[400\\][\\s\\S]*',
  },
  401: {
    pattern: '[\\s\\S]*\\[401\\][\\s\\S]*',
  },
  403: {
    pattern: '[\\s\\S]*\\[403\\][\\s\\S]*',
  },
  404: {
    pattern: '[\\s\\S]*\\[404\\][\\s\\S]*',
  },
  422: {
    pattern: '[\\s\\S]*\\[422\\][\\s\\S]*',
  },
  500: {
    pattern: '[\\s\\S]*(Process\\s?exited\\s?before\\s?completing\\s?request|\\[500\\])[\\s\\S]*',
  },
  502: {
    pattern: '[\\s\\S]*\\[502\\][\\s\\S]*',
  },
  504: {
    pattern: '([\\s\\S]*\\[504\\][\\s\\S]*)|(.*Task timed out after \\d+\\.\\d+ seconds$)',
  },
};

module.exports = {
  validate() {
    const events = [];
    const corsPreflight = {};
    const apiGateway = this.serverless.service.provider.apiGateway;

    if (apiGateway && apiGateway.restApiId && !apiGateway.restApiRootResourceId) {
      throw new ServerlessError(
        'Missing required "provider.apiGateway.restApiRootResourceId" property (needed if "provider.apiGateway.restApiId" is provided)',
        'API_GATEWAY_MISSING_REST_API_ROOT_RESOURCE_ID'
      );
    }

    Object.entries(this.serverless.service.functions).forEach(([functionName, functionObject]) => {
      (functionObject.events || []).forEach((event) => {
        if (event.http) {
          const http = this.getHttp(event);

          http.path = this.getHttpPath(http);
          http.method = this.getHttpMethod(http);

          if (http.authorizer) {
            http.authorizer = this.getAuthorizer(http);
          }

          if (http.cors) {
            http.cors = this.getCors(http);

            const cors = corsPreflight[http.path] || {};

            cors.headers = _.union(http.cors.headers, cors.headers);
            cors.methods = _.union(http.cors.methods, cors.methods);
            cors.origins = _.union(http.cors.origins, cors.origins);
            cors.origin = http.cors.origin;
            cors.allowCredentials = cors.allowCredentials || http.cors.allowCredentials;

            // when merging, last one defined wins
            if (http.cors.maxAge) {
              cors.maxAge = http.cors.maxAge;
            }

            if (http.cors.cacheControl) {
              cors.cacheControl = http.cors.cacheControl;
            }

            corsPreflight[http.path] = cors;
          }

          http.integration = this.getIntegration(http);

          if (http.integration === 'HTTP' || http.integration === 'HTTP_PROXY') {
            if (!http.request || !http.request.uri) {
              const errorMessage = [
                `You need to set the request uri when using the ${http.integration} integration.`,
              ];
              throw new ServerlessError(errorMessage, 'API_GATEWAY_MISSING_REQUEST_URI');
            }

            http.connectionType = this.getConnectionType(http);

            if (http.connectionType && http.connectionType === 'VPC_LINK' && !http.connectionId) {
              const errorMessage = [
                `You need to set connectionId when using ${http.connectionType} connectionType.`,
              ];
              throw new ServerlessError(errorMessage, 'API_GATEWAY_MISSING_CONNECTION_ID');
            }
          }

          if (http.integration === 'AWS' || http.integration === 'HTTP') {
            http.request = this.getRequest(http);
            http.request.passThrough = this.getRequestPassThrough(http);
            http.response = this.getResponse(http);
            if (http.integration === 'AWS' && !Object.keys(http.response).length) {
              http.response = {
                statusCodes: DEFAULT_STATUS_CODES,
              };
            }
          } else if (http.integration === 'AWS_PROXY' || http.integration === 'HTTP_PROXY') {
            // show a warning when request / response config is used with AWS_PROXY (LAMBDA-PROXY)
            if (http.request) {
              const keys = Object.keys(http.request);
              const allowedKeys =
                http.integration === 'AWS_PROXY'
                  ? ['parameters', 'schema', 'schemas']
                  : ['parameters', 'uri', 'schema', 'schemas'];

              if (_.difference(keys, allowedKeys).length) {
                const requestWarningMessage = [
                  `You're using the ${http.integration} in combination with a request`,
                  ` configuration in your function "${functionName}". Only the `,
                  allowedKeys.map((value) => `request.${value}`).join(', '),
                  ` configs are available in conjunction with ${http.integration}.`,
                  ' Serverless will remove this configuration automatically',
                  ' before deployment.',
                ].join('');
                legacy.log(`Warning! ${requestWarningMessage}`);
                log.warning(requestWarningMessage);
                for (const key of keys) {
                  if (!allowedKeys.includes(key)) {
                    delete http.request[key];
                  }
                }
              }
              if (Object.keys(http.request).length === 0) {
                // No keys left, delete the request object
                delete http.request;
              } else {
                http.request = this.getRequest(http);
              }
            }
            if (http.response) {
              legacy.log(
                [
                  `Warning! You're using the ${http.integration} in combination with response`,
                  ` configuration in your function "${functionName}".`,
                  ' Serverless will remove this configuration automatically before deployment.',
                ].join('')
              );
              log.warning(
                [
                  `You're using the ${http.integration} in combination with response`,
                  ` configuration in your function "${functionName}".`,
                  ' Serverless will remove this configuration automatically before deployment.',
                ].join('')
              );

              delete http.response;
            }
          }

          const provider = this.serverless.getProvider('aws');
          const stage = provider.getStage();
          const validAPIGatewayStageNamePattern = /^[-_a-zA-Z0-9]+$/;
          if (!validAPIGatewayStageNamePattern.test(stage)) {
            throw new ServerlessError(
              [
                `Invalid stage name ${stage}:`,
                'it should contains only [-_a-zA-Z0-9] for AWS provider if http event are present',
                'according to API Gateway limitation.',
              ].join(' '),
              'API_GATEWAY_INVALID_STAGE_NAME'
            );
          }

          events.push({
            functionName,
            http,
          });
        }
      });
    });

    return {
      events,
      corsPreflight,
    };
  },

  getHttp(event) {
    if (typeof event.http === 'object') {
      return event.http;
    }

    const [method, path] = event.http.split(' ');

    return { method, path };
  },

  getHttpPath(http) {
    return http.path.replace(/^\//, '').replace(/\/$/, '');
  },

  getHttpMethod(http) {
    return http.method.toLowerCase();
  },

  getAuthorizer(http) {
    const authorizer = http.authorizer;

    let type;
    let name;
    let arn;
    let managedExternally;
    let identitySource;
    let resultTtlInSeconds;
    let identityValidationExpression;
    let claims;
    let authorizerId;
    let scopes;
    let authorizerFunctionName;
    let logicalId;

    if (typeof authorizer === 'string') {
      if (authorizer.toUpperCase() === 'AWS_IAM') {
        type = 'AWS_IAM';
      } else if (authorizer.indexOf(':') === -1) {
        authorizerFunctionName = name = authorizer;
      } else {
        arn = authorizer;
        name = this.provider.naming.extractAuthorizerNameFromArn(arn);
      }
    } else if (typeof authorizer === 'object') {
      if (authorizer.type && authorizer.authorizerId) {
        type = authorizer.type;
        authorizerId = authorizer.authorizerId;
      } else if (authorizer.type && authorizer.type.toUpperCase() === 'AWS_IAM') {
        type = 'AWS_IAM';
      } else if (authorizer.arn) {
        arn = authorizer.arn;
        if (typeof authorizer.name === 'string') {
          name = authorizer.name;
        } else if (
          authorizer.type &&
          authorizer.type.toUpperCase() === 'COGNITO_USER_POOLS' &&
          _.isObject(authorizer.arn)
        ) {
          throw new ServerlessError(
            'Please provide an authorizer name for authorizers of type COGNITO_USER_POOLS',
            'API_GATEWAY_MISSING_AUTHORIZER_NAME'
          );
        } else {
          name = this.provider.naming.extractAuthorizerNameFromArn(arn);
        }
      } else if (authorizer.name) {
        authorizerFunctionName = name = authorizer.name;
      } else {
        throw new ServerlessError(
          'Please provide either an authorizer name or ARN',
          'API_GATEWAY_MISSING_AUTHORIZER_NAME_OR_ARN'
        );
      }

      if (!type) {
        type = authorizer.type;
      }

      resultTtlInSeconds = Number.parseInt(authorizer.resultTtlInSeconds, 10);
      resultTtlInSeconds = Number.isNaN(resultTtlInSeconds) ? 300 : resultTtlInSeconds;
      claims = authorizer.claims || [];
      scopes = authorizer.scopes;

      identitySource = authorizer.identitySource;
      identityValidationExpression = authorizer.identityValidationExpression;

      managedExternally =
        authorizer.managedExternally == null ? false : authorizer.managedExternally;
    }

    if (authorizerFunctionName) {
      const authorizerFunctionObj = this.serverless.service.getFunction(authorizerFunctionName);
      arn = resolveLambdaTarget(authorizerFunctionName, authorizerFunctionObj);
      if (authorizerFunctionObj.targetAlias) {
        logicalId = authorizerFunctionObj.targetAlias.logicalId;
      }
    }

    if (typeof managedExternally === 'undefined') {
      managedExternally = false;
    }

    if (typeof identitySource === 'undefined') {
      identitySource = 'method.request.header.Authorization';
    }

    const integration = this.getIntegration(http);
    if (
      integration === 'AWS_PROXY' &&
      typeof arn === 'string' &&
      awsArnRegExs.cognitoIdpArnExpr.test(arn) &&
      claims &&
      claims.length > 0
    ) {
      const errorMessage = [
        'Cognito claims can only be filtered when using the lambda integration type',
      ];
      throw new ServerlessError(errorMessage, 'API_GATEWAY_INVALID_COGNITO_CLAIMS');
    }

    return {
      type,
      name,
      arn,
      managedExternally,
      authorizerId,
      logicalId,
      resultTtlInSeconds,
      identitySource,
      identityValidationExpression,
      claims,
      scopes,
    };
  },

  getCors(http) {
    const headers = [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Security-Token',
      'X-Amz-User-Agent',
    ];

    const cors = {
      origin: '*',
      methods: ['OPTIONS'],
      headers,
      allowCredentials: false,
    };

    if (typeof http.cors === 'object') {
      if (http.cors.origins) {
        delete cors.origin;
      }
      Object.assign(cors, http.cors);
      cors.methods = cors.methods || [];
      cors.allowCredentials = Boolean(cors.allowCredentials);

      const corsHeaders = cors.headers;
      if (corsHeaders) {
        if (typeof corsHeaders === 'string') {
          cors.headers = [corsHeaders];
        }
      } else {
        cors.headers = headers;
      }

      if (cors.methods.indexOf('OPTIONS') === NOT_FOUND) {
        cors.methods.push('OPTIONS');
      }

      if (cors.methods.indexOf(http.method.toUpperCase()) === NOT_FOUND) {
        cors.methods.push(http.method.toUpperCase());
      }
    } else {
      cors.methods.push(http.method.toUpperCase());
    }
    return cors;
  },

  getIntegration(http) {
    if (http.integration) {
      // normalize the integration for further processing
      const normalizedIntegration = http.integration.toUpperCase().replace('-', '_');
      if (normalizedIntegration === 'LAMBDA') {
        return 'AWS';
      } else if (normalizedIntegration === 'LAMBDA_PROXY') {
        return 'AWS_PROXY';
      }
      return normalizedIntegration;
    }

    if (http.async) {
      return 'AWS';
    }

    return 'AWS_PROXY';
  },

  getConnectionType(http) {
    if (http.connectionType) {
      // normalize the connection type for further processing
      return http.connectionType.toUpperCase().replace('-', '_');
    }

    return null;
  },

  getRequest(http) {
    if (http.request) {
      const request = http.request;

      if (request.parameters) {
        request.parameters = this.getRequestParameters(request);
      }

      return request;
    }

    return {};
  },

  getRequestParameters(httpRequest) {
    const parameters = {};
    // only these locations are currently supported
    const locations = ['querystrings', 'paths', 'headers'];
    locations.forEach((location) => {
      // strip the plural s
      const singular = location.substring(0, location.length - 1);
      const parameter = httpRequest.parameters[location];
      if (parameter) {
        Object.entries(parameter).forEach(([key, value]) => {
          parameters[`method.request.${singular}.${key}`] = value;
        });
      }
    });
    return parameters;
  },

  getRequestPassThrough(http) {
    if (http.request.passThrough) {
      return http.request.passThrough;
    }

    // Validate() sets the passThrough default to NEVER. This is inappropriate
    // for HTTP and MOCK integrations, where there is no default request template defined.
    const type = http.integration || 'AWS_PROXY';
    if (type === 'AWS') {
      return 'NEVER';
    } else if (type === 'HTTP' || type === 'MOCK') {
      return undefined;
    }

    return 'WHEN_NO_MATCH';
  },

  getResponse(http) {
    if (http.response) {
      const response = http.response;

      if (response.statusCodes) {
        response.statusCodes = Object.assign({}, response.statusCodes);

        if (!Object.values(response.statusCodes).some((code) => code.pattern === '')) {
          response.statusCodes['200'] = DEFAULT_STATUS_CODES['200'];
        }
      } else {
        response.statusCodes = DEFAULT_STATUS_CODES;
      }

      return response;
    }

    return {};
  },

  getLambdaName(arn) {
    const splitArn = arn.split(':');
    const splitLambdaName = splitArn[splitArn.length - 1].split('-');
    return splitLambdaName[splitLambdaName.length - 1];
  },
};
