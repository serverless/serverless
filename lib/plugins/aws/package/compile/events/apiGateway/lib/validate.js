'use strict';

const _ = require('lodash');
const awsArnRegExs = require('../../../../../utils/arnRegularExpressions');

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

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      _.forEach(functionObject.events, event => {
        if (_.has(event, 'http')) {
          const http = this.getHttp(event, functionName);

          http.path = this.getHttpPath(http, functionName);
          http.method = this.getHttpMethod(http, functionName);

          if (http.authorizer) {
            http.authorizer = this.getAuthorizer(http, functionName);
          }

          if (http.cors) {
            http.cors = this.getCors(http);

            const cors = corsPreflight[http.path] || {};

            cors.headers = _.union(http.cors.headers, cors.headers);
            cors.methods = _.union(http.cors.methods, cors.methods);
            cors.origins = _.union(http.cors.origins, cors.origins);
            cors.origin = http.cors.origin || '*';
            cors.allowCredentials = cors.allowCredentials || http.cors.allowCredentials;

            // when merging, last one defined wins
            if (_.has(http.cors, 'maxAge')) {
              cors.maxAge = http.cors.maxAge;
            }

            if (_.has(http.cors, 'cacheControl')) {
              cors.cacheControl = http.cors.cacheControl;
            }

            corsPreflight[http.path] = cors;
          }

          http.integration = this.getIntegration(http, functionName);

          if (
            (http.integration === 'HTTP' || http.integration === 'HTTP_PROXY') &&
            (!http.request || !http.request.uri)
          ) {
            const errorMessage = [
              `You need to set the request uri when using the ${http.integration} integration.`,
            ];
            throw new this.serverless.classes.Error(errorMessage);
          }

          if (http.integration === 'AWS' || http.integration === 'HTTP') {
            http.request = this.getRequest(http);
            http.request.passThrough = this.getRequestPassThrough(http);
            http.response = this.getResponse(http);
            if (http.integration === 'AWS' && _.isEmpty(http.response)) {
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
                  ? ['parameters', 'schema']
                  : ['parameters', 'uri', 'schema'];

              if (!_.isEmpty(_.difference(keys, allowedKeys))) {
                const requestWarningMessage = [
                  `Warning! You're using the ${http.integration} in combination with a request`,
                  ` configuration in your function "${functionName}". Only the `,
                  _.map(allowedKeys, value => `request.${value}`).join(', '),
                  ` configs are available in conjunction with ${http.integration}.`,
                  ' Serverless will remove this configuration automatically',
                  ' before deployment.',
                ].join('');
                this.serverless.cli.log(requestWarningMessage);
                for (const key of keys) {
                  if (!_.includes(allowedKeys, key)) {
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
              const warningMessage = [
                `Warning! You're using the ${http.integration} in combination with response`,
                ` configuration in your function "${functionName}".`,
                ' Serverless will remove this configuration automatically before deployment.',
              ].join('');
              this.serverless.cli.log(warningMessage);

              delete http.response;
            }
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

  getHttp(event, functionName) {
    if (typeof event.http === 'object') {
      return event.http;
    } else if (typeof event.http === 'string') {
      return {
        method: event.http.split(' ')[0],
        path: event.http.split(' ')[1],
      };
    }
    const errorMessage = [
      `Invalid http event in function "${functionName}"`,
      ' in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getHttpPath(http, functionName) {
    if (http && typeof http.path === 'string') {
      return http.path.replace(/^\//, '').replace(/\/$/, '');
    }
    const errorMessage = [
      `Missing or invalid "path" property in function "${functionName}"`,
      ' for http event in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the indentation of your config values if you use the object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getHttpMethod(http, functionName) {
    if (typeof http.method === 'string') {
      const method = http.method.toLowerCase();

      const allowedMethods = ['get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any'];
      if (allowedMethods.indexOf(method) === -1) {
        const errorMessage = [
          `Invalid APIG method "${http.method}" in function "${functionName}".`,
          ` AWS supported methods are: ${allowedMethods.join(', ')}.`,
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      return method;
    }
    const errorMessage = [
      `Missing or invalid "method" property in function "${functionName}"`,
      ' for http event in serverless.yml.',
      ' If you define an http event, make sure you pass a valid value for it,',
      ' either as string syntax, or object syntax.',
      ' Please check the docs for more options.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  },

  getAuthorizer(http, functionName) {
    const authorizer = http.authorizer;

    let type;
    let name;
    let arn;
    let identitySource;
    let resultTtlInSeconds;
    let identityValidationExpression;
    let claims;
    let authorizerId;
    let scopes;

    if (typeof authorizer === 'string') {
      if (authorizer.toUpperCase() === 'AWS_IAM') {
        type = 'AWS_IAM';
      } else if (authorizer.indexOf(':') === -1) {
        name = authorizer;
        arn = this.getLambdaArn(authorizer);
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
        if (_.isString(authorizer.name)) {
          name = authorizer.name;
        } else {
          name = this.provider.naming.extractAuthorizerNameFromArn(arn);
        }
      } else if (authorizer.name) {
        name = authorizer.name;
        arn = this.getLambdaArn(name);
      } else {
        throw new this.serverless.classes.Error('Please provide either an authorizer name or ARN');
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
    } else {
      const errorMessage = [
        `authorizer property in function ${functionName} is not an object nor a string.`,
        ' The correct format is: authorizer: functionName',
        ' OR an object containing a name property.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
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
      throw new this.serverless.classes.Error(errorMessage);
    }

    return {
      type,
      name,
      arn,
      authorizerId,
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

    let cors = {
      origins: ['*'],
      origin: '*',
      methods: ['OPTIONS'],
      headers,
      allowCredentials: false,
    };

    if (typeof http.cors === 'object') {
      cors = http.cors;
      cors.methods = cors.methods || [];
      cors.allowCredentials = Boolean(cors.allowCredentials);

      if (cors.origins && cors.origin) {
        const errorMessage = [
          'You can only use "origin" or "origins",',
          ' but not both at the same time to configure CORS.',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      if (cors.headers) {
        if (!Array.isArray(cors.headers)) {
          const errorMessage = [
            'CORS header values must be provided as an array.',
            ' Please check the docs for more info.',
          ].join('');
          throw new this.serverless.classes.Error(errorMessage);
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
      if (_.has(cors, 'maxAge')) {
        if (!_.isInteger(cors.maxAge) || cors.maxAge < 1) {
          const errorMessage = 'maxAge should be an integer over 0';
          throw new this.serverless.classes.Error(errorMessage);
        }
      }
    } else {
      cors.methods.push(http.method.toUpperCase());
    }
    return cors;
  },

  getIntegration(http, functionName) {
    if (http.integration) {
      // normalize the integration for further processing
      const normalizedIntegration = http.integration.toUpperCase().replace('-', '_');
      const allowedIntegrations = [
        'LAMBDA_PROXY',
        'LAMBDA',
        'AWS',
        'AWS_PROXY',
        'HTTP',
        'HTTP_PROXY',
        'MOCK',
      ];
      // check if the user has entered a non-valid integration
      if (allowedIntegrations.indexOf(normalizedIntegration) === NOT_FOUND) {
        const errorMessage = [
          `Invalid APIG integration "${http.integration}"`,
          ` in function "${functionName}".`,
          ' Supported integrations are:',
          ' lambda, lambda-proxy, aws, aws-proxy, http, http-proxy, mock.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
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

  getRequest(http) {
    if (http.request) {
      const request = http.request;

      if (typeof http.request !== 'object') {
        const errorMessage = [
          'Request config must be provided as an object.',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      if (http.request.template && typeof http.request.template !== 'object') {
        const errorMessage = [
          'Template config must be provided as an object.',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

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
    _.each(locations, location => {
      // strip the plural s
      const singular = location.substring(0, location.length - 1);
      _.each(httpRequest.parameters[location], (value, key) => {
        parameters[`method.request.${singular}.${key}`] = value;
      });
    });
    return parameters;
  },

  getRequestPassThrough(http) {
    const requestPassThroughBehaviors = ['NEVER', 'WHEN_NO_MATCH', 'WHEN_NO_TEMPLATES'];

    if (http.request.passThrough) {
      if (requestPassThroughBehaviors.indexOf(http.request.passThrough) === -1) {
        const errorMessage = [
          'Request passThrough "',
          http.request.passThrough,
          '" is not one of ',
          requestPassThroughBehaviors.join(', '),
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      return http.request.passThrough;
    }

    // Validate() sets the passThrough default to NEVER. This is inappropriate
    // for HTTP and MOCK integrations, where there is no default request template defined.
    const type = http.integration || 'AWS_PROXY';
    if (type === 'AWS') {
      return requestPassThroughBehaviors[0];
    } else if (type === 'HTTP' || type === 'MOCK') {
      return undefined;
    }

    return 'WHEN_NO_MATCH';
  },

  getResponse(http) {
    if (http.response) {
      const response = http.response;

      if (typeof response !== 'object') {
        const errorMessage = [
          'Response config must be provided as an object.',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      if (response.headers && typeof response.headers !== 'object') {
        const errorMessage = [
          'Response headers must be provided as an object.',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      if (response.statusCodes) {
        response.statusCodes = _.assign({}, response.statusCodes);

        if (!_.some(response.statusCodes, code => code.pattern === '')) {
          response.statusCodes['200'] = DEFAULT_STATUS_CODES['200'];
        }
      } else {
        response.statusCodes = DEFAULT_STATUS_CODES;
      }

      return response;
    }

    return {};
  },

  getLambdaArn(name) {
    this.serverless.service.getFunction(name);
    const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(name);
    return { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] };
  },

  getLambdaName(arn) {
    const splitArn = arn.split(':');
    const splitLambdaName = splitArn[splitArn.length - 1].split('-');
    return splitLambdaName[splitLambdaName.length - 1];
  },
};
