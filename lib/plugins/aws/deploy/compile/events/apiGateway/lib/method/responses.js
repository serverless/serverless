'use strict';

const _ = require('lodash');

module.exports = {

  getMethodResponses(httpEvent) {
    const methodResponses = [];

    if (httpEvent.integration === 'AWS') {
      if (httpEvent.response) {
        const methodResponseHeaders = [];

        if (httpEvent.cors) {
          _.merge(methodResponseHeaders, {
            'Access-Control-Allow-Origin': httpEvent.cors.origins.join(','),
          });
        }

        if (httpEvent.response.headers) {
          _.merge(methodResponseHeaders, httpEvent.response.headers);
        }

        _.each(httpEvent.response.statusCodes, (value, key) => {
          const methodResponse = {
            ResponseParameters: {},
            ResponseModels: {},
            StatusCode: parseInt(key, 10),
          };

          _.merge(methodResponse.ResponseParameters,
            this.getMethodResponseHeaders(methodResponseHeaders));

          if (value.headers) {
            _.merge(methodResponse.ResponseParameters,
              this.getMethodResponseHeaders(value.headers));
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
