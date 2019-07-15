'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileCors() {
    _.forEach(this.validated.corsPreflight, (config, path) => {
      const resourceName = this.getResourceName(path);
      const resourceRef = this.getResourceId(path);
      const corsMethodLogicalId = this.provider.naming.getMethodLogicalId(resourceName, 'options');

      let origin = config.origin;
      let origins = config.origins && Array.isArray(config.origins) ? config.origins : undefined;

      if (origin && origin.indexOf(',') !== -1) {
        origins = origin.split(',').map(a => a.trim());
      }

      if (!_.isEmpty(origins)) {
        origin = origins[0];
      }

      if (!origin) {
        const errorMessage = 'must specify either origin or origins';
        throw new this.serverless.classes.Error(errorMessage);
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

      // Allow Cache-Control header if set
      if (_.has(config, 'cacheControl')) {
        preflightHeaders['Cache-Control'] = `'${config.cacheControl}'`;
      }

      if (_.includes(config.methods, 'ANY')) {
        preflightHeaders['Access-Control-Allow-Methods'] = preflightHeaders[
          'Access-Control-Allow-Methods'
        ].replace('ANY', 'DELETE,GET,HEAD,PATCH,POST,PUT');
      }

      this.apiGatewayMethodLogicalIds.push(corsMethodLogicalId);

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
              ContentHandling: 'CONVERT_TO_TEXT',
              IntegrationResponses: this.generateCorsIntegrationResponses(
                preflightHeaders,
                origins
              ),
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

  generateCorsIntegrationResponses(preflightHeaders, origins) {
    const responseParameters = _.mapKeys(
      preflightHeaders,
      (value, header) => `method.response.header.${header}`
    );

    return [
      {
        StatusCode: '200',
        ResponseParameters: responseParameters,
        ResponseTemplates: {
          'application/json':
            Array.isArray(origins) && origins.length
              ? this.generateCorsResponseTemplate(origins)
              : '',
        },
      },
    ];
  },

  regexifyWildcards(orig) {
    return orig.map(str => str.replace(/\./g, '[.]').replace('*', '.*'));
  },

  generateCorsResponseTemplate(origins) {
    // glob pattern needs to be parsed into a Java regex
    // escape literal dots, replace wildcard * for .*
    const regexOrigins = this.regexifyWildcards(origins);

    return (
      '#set($origin = $input.params("Origin"))\n' +
      '#if($origin == "") #set($origin = $input.params("origin")) #end\n' +
      `#if(${regexOrigins
        .map((o, i, a) => `$origin.matches("${o}")${i < a.length - 1 ? ' || ' : ''}`)
        .join('')}` +
      ') #set($context.responseOverride.header.Access-Control-Allow-Origin = $origin) #end'
    );
  },
};
