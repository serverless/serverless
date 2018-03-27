'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compileCors() {
    _.forEach(this.validated.corsPreflight, (config, path) => {
      const resourceName = this.getResourceName(path);
      const resourceRef = this.getResourceId(path);
      const corsMethodLogicalId = this.provider.naming
        .getMethodLogicalId(resourceName, 'options');

      // TODO remove once "origins" config is deprecated
      let origin = config.origin;
      if (config.origins && config.origins.length) {
        origin = config.origins.join(',');
      }

      const preflightHeaders = {
        'Access-Control-Allow-Origin': `'${origin}'`,
        'Access-Control-Allow-Headers': `'${config.headers.join(',')}'`,
        'Access-Control-Allow-Methods': `'${config.methods.join(',')}'`,
        'Access-Control-Allow-Credentials': `'${config.allowCredentials}'`,
      };

      // Enable CORS Max Age usage if set
      if (_.has(config, 'maxAge')) {
        if (_.isInteger(config.maxAge) && config.maxAge > 0) {
          preflightHeaders['Access-Control-Max-Age'] = `'${config.maxAge}'`;
        } else {
          const errorMessage = 'maxAge should be an integer over 0';
          throw new this.serverless.classes.Error(errorMessage);
        }
      }

      if (_.includes(config.methods, 'ANY')) {
        preflightHeaders['Access-Control-Allow-Methods'] =
          preflightHeaders['Access-Control-Allow-Methods']
            .replace('ANY', 'DELETE,GET,HEAD,PATCH,POST,PUT');
      }

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [corsMethodLogicalId]: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            AuthorizationType: 'NONE',
            HttpMethod: 'OPTIONS',
            MethodResponses: this.generateCorsMethodResponses(preflightHeaders),
            RequestParameters: {},
            Integration: {
              Type: 'MOCK',
              RequestTemplates: {
                'application/json': '{statusCode:200}',
              },
              IntegrationResponses: this.generateCorsIntegrationResponses(preflightHeaders),
            },
            ResourceId: resourceRef,
            RestApiId: this.provider.getApiGatewayRestApiId(),
          },
        },
      });
    });

    return BbPromise.resolve();
  },

  generateCorsMethodResponses(preflightHeaders) {
    const methodResponseHeaders = {};

    _.forEach(preflightHeaders, (value, header) => {
      methodResponseHeaders[`method.response.header.${header}`] = true;
    });

    return [
      {
        StatusCode: '200',
        ResponseParameters: methodResponseHeaders,
        ResponseModels: {},
      },
    ];
  },

  generateCorsIntegrationResponses(preflightHeaders) {
    const responseParameters = _.mapKeys(preflightHeaders,
      (value, header) => `method.response.header.${header}`);

    return [
      {
        StatusCode: '200',
        ResponseParameters: responseParameters,
        ResponseTemplates: {
          'application/json': '',
        },
      },
    ];
  },

};
