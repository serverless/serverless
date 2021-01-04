'use strict';

const _ = require('lodash');

module.exports = {
  getMethodResponses(http) {
    const methodResponses = [];

    if (http.integration === 'AWS' || http.integration === 'HTTP' || http.integration === 'MOCK') {
      if (http.response) {
        const methodResponseHeaders = [];

        if (http.cors) {
          let origin = http.cors.origin;

          // TODO remove once "origins" config is deprecated
          if (http.cors.origins && http.cors.origins.length) {
            origin = http.cors.origins.join(',');
          }

          _.merge(methodResponseHeaders, {
            'Access-Control-Allow-Origin': `'${origin}'`,
          });

          // Only set Access-Control-Allow-Credentials when explicitly allowed (omit if false)
          if (http.cors.allowCredentials) {
            methodResponseHeaders['Access-Control-Allow-Credentials'] = 'true';
          }
        }

        if (http.response.headers) {
          _.merge(methodResponseHeaders, http.response.headers);
        }

        Object.entries(http.response.statusCodes).forEach(([statusCode, config]) => {
          const methodResponse = {
            ResponseParameters: {},
            ResponseModels: {},
            StatusCode: statusCode,
          };

          _.merge(
            methodResponse.ResponseParameters,
            this.getMethodResponseHeaders(methodResponseHeaders)
          );

          if (config.headers) {
            _.merge(
              methodResponse.ResponseParameters,
              this.getMethodResponseHeaders(config.headers)
            );
          }

          methodResponses.push(methodResponse);
        });
      }
    }

    return {
      Properties: {
        MethodResponses: methodResponses,
      },
    };
  },

  getMethodResponseHeaders(headers) {
    const methodResponseHeaders = {};

    Object.keys(headers).forEach((header) => {
      methodResponseHeaders[`method.response.header.${header}`] = true;
    });

    return methodResponseHeaders;
  },
};
