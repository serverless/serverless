'use strict';

const _ = require('lodash');

module.exports = {

  getMethodResponses(http) {
    const methodResponses = [];

    if (http.integration === 'AWS' || http.integration === 'HTTP' || http.integration === 'MOCK') {
      if (http.response) {
        const methodResponseHeaders = [];

        if (http.cors) {
          // TODO remove once "origins" config is deprecated
          let origin = http.cors.origin;
          if (http.cors.origins && http.cors.origins.length) {
            origin = http.cors.origins.join(',');
          }

          _.merge(methodResponseHeaders, {
            'Access-Control-Allow-Origin': `'${origin}'`,
          });
        }

        if (http.response.headers) {
          _.merge(methodResponseHeaders, http.response.headers);
        }

        _.each(http.response.statusCodes, (config, statusCode) => {
          const methodResponse = {
            ResponseParameters: {},
            ResponseModels: {},
            StatusCode: parseInt(statusCode, 10),
          };

          _.merge(methodResponse.ResponseParameters,
            this.getMethodResponseHeaders(methodResponseHeaders));

          if (config.headers) {
            _.merge(methodResponse.ResponseParameters,
              this.getMethodResponseHeaders(config.headers));
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

    Object.keys(headers).forEach(header => {
      methodResponseHeaders[`method.response.header.${header}`] = true;
    });

    return methodResponseHeaders;
  },

};
