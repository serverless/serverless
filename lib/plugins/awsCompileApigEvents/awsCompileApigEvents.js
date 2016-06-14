'use strict';

const BbPromise = require('bluebird');

const validateInput = require('./lib/validateInput');
const compileRestApi = require('./lib/compileRestApi');
const compileDeployment = require('./lib/compileDeployment');
const compileStage = require('./lib/compileStage');
const compileResources = require('./lib/compileResources');
const compileMethod = require('./lib/compileMethod');
const compilePermission = require('./lib/compilePermission');

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
      compileMethod,
      compilePermission
    );

    this.hooks = {
      'deploy:compileEvents': () => BbPromise.bind(this)
        .then(this.validateInput)
        .then(this.compileRestApi)
        .then(this.compileDeployment)
        .then(this.compileStage)
        .then(this.compileResources)
        .then(this.compileMethod)
        .then(this.compilePermission),
    };
  }
}

module.exports = AwsCompileApigEvents;
