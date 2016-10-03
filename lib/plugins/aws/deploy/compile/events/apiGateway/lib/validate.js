'use strict';

const _ = require('lodash');

const NOT_FOUND = -1;
const DEFAULT_STATUS_CODES = {
  200: {
    pattern: '',
  },
  400: {
    pattern: '.*\\[400\\].*',
  },
  401: {
    pattern: '.*\\[401\\].*',
  },
  403: {
    pattern: '.*\\[403\\].*',
  },
  404: {
    pattern: '.*\\[404\\].*',
  },
  422: {
    pattern: '.*\\[422\\].*',
  },
  500: {
    pattern: '.*(Process\\s?exited\\s?before\\s?completing\\s?request|\\[500\\]).*',
  },
  502: {
    pattern: '.*\\[502\\].*',
  },
  504: {
    pattern: '.*\\[504\\].*',
  },
};

module.exports = {

  parseHttpEvent(httpEvent) {
    if (typeof httpEvent === 'string') {
      const parts = httpEvent.split(' ');
      const method = parts[0];
      const path = parts[1];

      return { method, path };
    }

    return httpEvent;
  },

  getAuthorizer(httpEvent) {
    let authorizerName;
    let authorizerArn;

    if (typeof httpEvent.authorizer === 'string') {
      if (httpEvent.authorizer.indexOf(':') === NOT_FOUND) {
        authorizerName = httpEvent.authorizer;
        const normalizedAuthorizerName = authorizerName[0]
            .toUpperCase() + authorizerName.substr(1);
        authorizerArn = { 'Fn::GetAtt': [`${normalizedAuthorizerName}LambdaFunction`, 'Arn'] };
      } else {
        authorizerArn = httpEvent.authorizer;
        const splittedAuthorizerArn = httpEvent.authorizer.split(':');
        const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
          .length - 1].split('-');
        authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
      }
    } else if (typeof httpEvent.authorizer === 'object') {
      if (httpEvent.authorizer.arn) {
        authorizerArn = httpEvent.authorizer.arn;
        const splittedAuthorizerArn = httpEvent.authorizer.arn.split(':');
        const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
          .length - 1].split('-');
        authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
      } else if (httpEvent.authorizer.name) {
        authorizerName = httpEvent.authorizer.name;
        const normalizedAuthorizerName = authorizerName[0]
            .toUpperCase() + authorizerName.substr(1);
        authorizerArn = { 'Fn::GetAtt': [`${normalizedAuthorizerName}LambdaFunction`, 'Arn'] };
      } else {
        throw new this.serverless.classes.Error('Please provide either an authorizer name or ARN');
      }
    } else {
      const errorMessage = [
        `authorizer property in function ${httpEvent.functionName} is not`,
        ' an object nor a string.',
        ' The correct format is: authorizer: functionName',
        ' OR an object containing a name property.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    return { name: authorizerName, arn: authorizerArn };
  },

  getCors(httpEvent) {
    const headers = [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Security-Token',
    ];

    let cors = {
      origins: ['*'],
      methods: ['OPTIONS'],
      headers,
    };

    if (typeof httpEvent.cors === 'object') {
      cors = httpEvent.cors;
      cors.methods = cors.methods || [];
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

      if (cors.methods.indexOf(httpEvent.method.toUpperCase()) === NOT_FOUND) {
        cors.methods.push(httpEvent.method.toUpperCase());
      }
    } else {
      cors.methods.push(httpEvent.method.toUpperCase());
    }

    return cors;
  },

  getIntegration(httpEvent) {
    if (httpEvent.integration) {
      const allowedIntegrations = [
        'LAMBDA-PROXY', 'LAMBDA',
      ];
      // normalize the integration for further processing
      const normalizedIntegration = httpEvent.integration.toUpperCase();
      // check if the user has entered a non-valid integration
      if (allowedIntegrations.indexOf(normalizedIntegration) === NOT_FOUND) {
        const errorMessage = [
          `Invalid APIG integration "${httpEvent.integration}"`,
          ` in function "${httpEvent.functionName}".`,
          ' Supported integrations are: lambda, lambda-proxy.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      if (normalizedIntegration === 'LAMBDA') {
        return 'AWS';
      }
    }
    return 'AWS_PROXY';
  },

  getRequest(httpEvent) {
    if (typeof httpEvent.request !== 'object') {
      const errorMessage = [
        'Request config must be provided as an object.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    if (httpEvent.request.template && typeof httpEvent.request.template !== 'object') {
      const errorMessage = [
        'Template config must be provided as an object.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    return httpEvent.request;
  },

  getRequestParameters(httpRequest) {
    const parameters = {};
    // only these locations are currently supported
    const locations = ['querystrings', 'paths', 'headers'];
    _.each(locations, (location) => {
      // strip the plural s
      const singular = location.substring(0, location.length - 1);
      _.each(httpRequest.parameters[location], (value, key) => {
        parameters[`method.request.${singular}.${key}`] = value;
      });
    });
    return parameters;
  },

  getRequestPassThrough(httpEvent) {
    const requestPassThroughBehaviors = [
      'NEVER', 'WHEN_NO_MATCH', 'WHEN_NO_TEMPLATES',
    ];

    if (httpEvent.request.passThrough) {
      if (requestPassThroughBehaviors.indexOf(httpEvent.request.passThrough) === -1) {
        const errorMessage = [
          'Request passThrough "',
          httpEvent.request.passThrough,
          '" is not one of ',
          requestPassThroughBehaviors.join(', '),
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      return httpEvent.request.passThrough;
    }

    return requestPassThroughBehaviors[0];
  },

  getResponse(httpEvent) {
    if (typeof httpEvent.response !== 'object') {
      const errorMessage = [
        'Response config must be provided as an object.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    if (httpEvent.response.headers && typeof httpEvent.response.headers !== 'object') {
      const errorMessage = [
        'Response headers must be provided as an object.',
        ' Please check the docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return httpEvent.response;
  },

  validate() {
    const corsConfig = {};
    const httpEvents = [];

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach((event) => {
        if (_.has(event, 'http')) {
          const httpEvent = this.parseHttpEvent(event.http);

          if (typeof httpEvent !== 'object') {
            const errorMessage = [
              `Invalid http event in function "${functionName}"`,
              ' in serverless.yml.',
              ' If you define an http event, make sure you pass a valid value for it,',
              ' either as string syntax, or object syntax.',
              ' Please check the docs for more options.',
            ].join('');
            throw new this.serverless.classes.Error(errorMessage);
          }

          httpEvent.functionName = functionName[0].toUpperCase() + functionName.substr(1);

          if (!httpEvent.path) {
            const errorMessage = [
              `Missing "path" property in function "${functionName}"`,
              ' for http event in serverless.yml.',
              ' If you define an http event, make sure you pass a valid value for it,',
              ' either as string syntax, or object syntax.',
              ' Please check the docs for more options.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          httpEvent.path = httpEvent.path.replace(/^\//, '');
          httpEvent.path = httpEvent.path.replace(/\/$/, '');

          if (!httpEvent.method) {
            const errorMessage = [
              `Missing "method" property in function "${functionName}"`,
              ' for http event in serverless.yml.',
              ' If you define an http event, make sure you pass a valid value for it,',
              ' either as string syntax, or object syntax.',
              ' Please check the docs for more options.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          httpEvent.method = httpEvent.method.toLowerCase();

          const allowedMethods = [
            'get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any',
          ];
          if (allowedMethods.indexOf(httpEvent.method) === NOT_FOUND) {
            const errorMessage = [
              `Invalid APIG method "${httpEvent.method}" in function "${functionName}".`,
              ` AWS supported methods are: ${allowedMethods.join(', ')}.`,
            ].join('');
            throw new this.serverless.classes.Error(errorMessage);
          }

          httpEvent.integration = this.getIntegration(httpEvent);

          if (httpEvent.authorizer) {
            httpEvent.authorizer = this.getAuthorizer(httpEvent);
          }

          if (httpEvent.cors) {
            httpEvent.cors = this.getCors(httpEvent);

            const cors = corsConfig[httpEvent.path] || {};

            cors.headers = _.union(httpEvent.cors.headers, cors.headers);
            cors.methods = _.union(httpEvent.cors.methods, cors.methods);
            cors.origins = _.union(httpEvent.cors.origins, cors.origins);

            corsConfig[httpEvent.path] = cors;
          }

          if (httpEvent.integration === 'AWS') {
            if (httpEvent.request) {
              httpEvent.request = this.getRequest(httpEvent);

              if (httpEvent.request.parameters) {
                httpEvent.request.parameters = this.getRequestParameters(httpEvent.request);
              }
            } else {
              httpEvent.request = {};
            }

            httpEvent.request.passThrough = this.getRequestPassThrough(httpEvent);

            if (httpEvent.response) {
              httpEvent.response = this.getResponse(httpEvent);
            } else {
              httpEvent.response = {};
            }

            if (httpEvent.response.statusCodes) {
              httpEvent.response.statusCodes = _.assign({}, httpEvent.response.statusCodes);

              if (!_.some(httpEvent.response.statusCodes, code => code.pattern === '')) {
                httpEvent.response.statusCodes['200'] = DEFAULT_STATUS_CODES['200'];
              }
            } else {
              httpEvent.response.statusCodes = DEFAULT_STATUS_CODES;
            }
          } else if (httpEvent.integration === 'AWS_PROXY') {
            // show a warning when request / response config is used with AWS_PROXY (LAMBDA-PROXY)
            if (httpEvent.request || httpEvent.response) {
              const warningMessage = [
                'Warning! You\'re using the LAMBDA-PROXY in combination with request / response',
                ` configuration in your function "${functionName}".`,
                ' This configuration will be ignored during deployment.',
              ].join('');
              this.serverless.cli.log(warningMessage);
            }
          }

          httpEvents.push(httpEvent);
        }
      });
    });

    return {
      corsPreflight: corsConfig,
      events: _.map(httpEvents, (httpEvent) => {
        if (httpEvent.cors) {
          return Object.create(httpEvent, {
            cors: {
              value: corsConfig[httpEvent.path],
            },
          });
        }

        return httpEvent;
      }),
    };
  },
};
