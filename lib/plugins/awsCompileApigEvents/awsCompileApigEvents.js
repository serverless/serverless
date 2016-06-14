'use strict';

const BbPromise = require('bluebird');

const validateInput = require('./lib/validateInput');
const compileRestApi = require('./lib/compileRestApi');
const compileDeployment = require('./lib/compileDeployment');
const compileStage = require('./lib/compileStage');
const compileResources = require('./lib/compileResources');
const compileMethods = require('./lib/compileMethods');
const compilePermissions = require('./lib/compilePermissions');

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validateInput,
      compileRestApi,
      compileDeployment,
      compileStage,
      compileResources,
      compileMethods,
    );

    this.hooks = {
      'deploy:compileEvents': () => BbPromise.bind(this)
        .then(this.validateInput)
        .then(this.compileRestApi)
        .then(this.compileDeployment)
        .then(this.compileStage)
        .then(this.compileResources)
        .then(this.compileMethods)
        .then(this.compilePermission),
    };
  }
}

module.exports = AwsCompileApigEvents;
