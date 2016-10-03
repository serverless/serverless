'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
const compileApiKeys = require('./lib/apiKeys');
const compileResources = require('./lib/resources');
const compileCors = require('./lib/cors');
const compileMethods = require('./lib/methods');
const compileAuthorizers = require('./lib/authorizers');
const compileDeployment = require('./lib/deployment');
const compilePermissions = require('./lib/permissions');
const getMethodAuthorization = require('./lib/method/authorization');
const getMethodIntegration = require('./lib/method/integration');
const getMethodResponses = require('./lib/method/responses');

module.exports = class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      compileRestApi,
      compileApiKeys,
      compileResources,
      compileCors,
      compileMethods,
      compileAuthorizers,
      compileDeployment,
      compilePermissions,
      getMethodAuthorization,
      getMethodIntegration,
      getMethodResponses
    );

    this.hooks = {
      'deploy:compileEvents': () => {
        const http = this.validate();

        if (http.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileRestApi)
          .then(() => this.compileResources(http))
          .then(() => this.compileCors(http))
          .then(() => this.compileMethods(http))
          .then(() => this.compileAuthorizers(http))
          .then(this.compileDeployment)
          .then(this.compileApiKeys)
          .then(() => this.compilePermissions(http));
      },
    };
  }

};
