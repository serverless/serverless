'use strict';

const BbPromise = require('bluebird');

const compileRestApi = require('./lib/compileRestApi');
const compileDeployment = require('./lib/compileDeployment');
const compileStage = require('./lib/compileStage');
const compileResource = require('./lib/compileResource');
const compileMethod = require('./lib/compileMethod');
const compilePermission = require('./lib/compilePermission');

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      compileRestApi,
      compileDeployment,
      compileStage,
      compileResource,
      compileMethod,
      compilePermission
    );

    this.hooks = {
      'deploy:compileEvents': () => BbPromise.bind(this)
        .then(this.compileRestApi)
        .then(this.compileDeployment)
        .then(this.compileStage)
        .then(this.compileResource)
        .then(this.compileMethod)
        .then(this.compilePermission),
    };
  }
}

module.exports = AwsCompileApigEvents;
