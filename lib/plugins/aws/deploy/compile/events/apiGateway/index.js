'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
const compileApiKeys = require('./lib/apiKeys');
const compileResources = require('./lib/resources');
const compileMethods = require('./lib/methods');
const compileAuthorizers = require('./lib/authorizers');
const compileDeployment = require('./lib/deployment');
const compilePermissions = require('./lib/permissions');

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';

    Object.assign(
      this,
      validate,
      compileRestApi,
      compileApiKeys,
      compileResources,
      compileMethods,
      compileAuthorizers,
      compileDeployment,
      compilePermissions
    );

    this.hooks = {
      'deploy:compileEvents': () => {
        let noEndpoints = true;
        _.forEach(this.serverless.service.functions, functionObj => {
          if (functionObj.events) {
            functionObj.events.forEach(event => {
              if (event.http) noEndpoints = false;
            });
          }
        });
        if (noEndpoints) return BbPromise.resolve();

        return BbPromise.bind(this)
          .then(this.validate)
          .then(this.compileRestApi)
          .then(this.compileApiKeys)
          .then(this.compileResources)
          .then(this.compileMethods)
          .then(this.compileAuthorizers)
          .then(this.compileDeployment)
          .then(this.compilePermissions);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
