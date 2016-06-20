'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
const compileResources = require('./lib/resources');
const compileMethods = require('./lib/methods');
const compileDeployment = require('./lib/deployment');
const compilePermissions = require('./lib/permissions');

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validate,
      compileRestApi,
      compileResources,
      compileMethods,
      compileDeployment,
      compilePermissions
    );

    this.hooks = {
      'deploy:compileEvents': () => {
        let noEndpoints = true;
        forEach(this.serverless.service.functions, functionObj => {
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
          .then(this.compileResources)
          .then(this.compileMethods)
          .then(this.compileDeployment)
          .then(this.compilePermissions);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
