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

      const preflightHeaders = {
        'Access-Control-Allow-Origin': `'${config.origins.join(',')}'`,
        'Access-Control-Allow-Headers': `'${config.headers.join(',')}'`,
        'Access-Control-Allow-Methods': `'${config.methods.join(',')}'`,
        'Access-Control-Allow-Credentials': `'${config.allowCredentials}'`,
      };

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
            RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
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
