'use strict';

const BbPromise = require('bluebird');

module.exports = {
  configureApiGwy: function () {
    return BbPromise.bind(this)
      .then(this.getFunctionsForContentHandling)
      .then(this.setContentHandling);
  },

  setContentHandling: function (funcs) {
    if (!Object.keys(funcs).length) {
      return;
    }
    const apiName = this.provider.naming.getApiGatewayName();
    const apigateway = new this.provider.sdk.APIGateway({
      region: this.options.region,
    });

    const integrationResponse = {
      statusCode: '200',
    };

    apigateway
    .getRestApis()
    .promise()
    .then((apis) => {
      integrationResponse.restApiId = apis.items.find(api => api.name === apiName).id;

      return apigateway
      .getResources({ restApiId: integrationResponse.restApiId })
      .promise();
    })
    .then((resources) => {
      const integrationPromises = [];

      Object.keys(funcs).forEach((fKey) => {
        funcs[fKey].events.forEach((e) => {
          if (e.http && e.http.contentHandling) {
            integrationResponse.httpMethod = e.http.method.toUpperCase();
            integrationResponse.contentHandling = e.http.contentHandling;
            integrationResponse.resourceId = resources.items.find(r => r.path === `/${e.http.path}`).id;

            integrationPromises
            .push(apigateway.putIntegrationResponse(integrationResponse).promise());
          }
        });
      });

      this.serverless.cli.log('Setting up content handling in AWS API Gateway (takes ~1 min)...');
      return BbPromise.all(integrationPromises);
    })
    // AWS Limit createDeployment: 3 requests per minute per account
    // 'Too Many Requests', error may occur as serverless calls this endpoint also.
    // Wait 1 minute to get reliable deployment.
    // http://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
    .then(() => new BbPromise(resolve => setTimeout(() => resolve(), 60000)))
    .then(() => {
      this.serverless.cli.log('Deploying content handling updates to AWS API Gateway...');
      return apigateway.createDeployment({
        stageName: this.options.stage,
        restApiId: integrationResponse.restApiId,
      }).promise();
    })
    .then((result) => {
      if (result.id) {
        this.serverless.cli.log('AWS API Gateway Deployed');
      }
    })
    .catch(err => this.serverless.cli.log(err.message));
  },

  getFunctionsForContentHandling: function () {
    const funcs = this.serverless.service.functions;
    const validFuncs = {};

    Object.keys(funcs).forEach((fKey) => {
      funcs[fKey].events.forEach((e) => {
        if (e.http && e.http.contentHandling) {
          validFuncs[fKey] = funcs[fKey];
        }
      });
    });
    return validFuncs;
  },
};
