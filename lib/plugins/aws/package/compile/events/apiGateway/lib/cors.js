'use strict';

const _ = require('lodash');

module.exports = {
  compileCors() {
    if (this.validated.corsPreflight) {
      Object.entries(this.validated.corsPreflight).forEach(([path, config]) => {
        const resourceName = this.getResourceName(path);
        const resourceRef = this.getResourceId(path);
        const corsMethodLogicalId = this.provider.naming.getMethodLogicalId(
          resourceName,
          'options'
        );

        let origin = config.origin;
        let origins = config.origins && Array.isArray(config.origins) ? config.origins : undefined;

        if (origin && origin.indexOf(',') !== -1) {
          origins = origin.split(',').map((a) => a.trim());
        }

        if (Array.isArray(origins) && origins.length) {
          origin = origins[0];
        }

        const preflightHeaders = {
          'Access-Control-Allow-Origin': `'${origin}'`,
          'Access-Control-Allow-Headers': `'${config.headers.join(',')}'`,
          'Access-Control-Allow-Methods': `'${config.methods.join(',')}'`,
        };

        // Only set Access-Control-Allow-Credentials when explicitly allowed (omit if false)
        if (config.allowCredentials) {
          preflightHeaders['Access-Control-Allow-Credentials'] = `'${config.allowCredentials}'`;
        }

        // Enable CORS Max Age usage if set
        if (config.maxAge) {
          preflightHeaders['Access-Control-Max-Age'] = `'${config.maxAge}'`;
        }

        // Allow Cache-Control header if set
        if (config.cacheControl) {
          preflightHeaders['Cache-Control'] = `'${config.cacheControl}'`;
        }

        if (config.methods.includes('ANY')) {
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
    }
  },

  generateCorsMethodResponses(preflightHeaders) {
    const methodResponseHeaders = {};

    Object.keys(preflightHeaders).forEach((header) => {
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
    return orig.map((str) => str.replace(/\./g, '[.]').replace('*', '.+'));
  },

  generateCorsResponseTemplate(origins) {
    // glob pattern needs to be parsed into a Java regex
    // escape literal dots, replace wildcard * for .+
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
