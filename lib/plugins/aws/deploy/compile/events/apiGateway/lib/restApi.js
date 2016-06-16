'use strict';

const merge = require('lodash').merge;
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    this.serverless.service.getAllFunctions().forEach(() => {
      const restApiTemplate = `
        {
          "Type" : "AWS::ApiGateway::RestApi",
          "Properties" : {
            "Name" : "${this.options.stage}-${this.serverless.service.service}"
          }
        }
      `;

      const newRestApiObject = {
        RestApiApigEvent: JSON.parse(restApiTemplate),
      };

      merge(this.serverless.service.resources.aws.Resources, newRestApiObject);
    });

    return BbPromise.resolve();
  },
};
