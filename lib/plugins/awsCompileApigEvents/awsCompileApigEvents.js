'use strict';

const BbPromise = require('bluebird');

const compileRestApi = require('./lib/compileRestApi');
const compileDeployment = require('./lib/compileDeployment');
const compileStage = require('./lib/compileStage');
const compileBasePathMapping = require('./lib/compileBasePathMapping');
const compileResource = require('./lib/compileResource');
const compileMethod = require('./lib/compileMethod');
const compilePermission = require('./lib/compilePermission');

class AwsCompileApigEvents {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(
      this,
      compileRestApi,
      compileDeployment,
      compileStage,
      compileBasePathMapping,
      compileResource,
      compileMethod,
      compilePermission
    );

    this.hooks = {
      'deploy:compileEvents': () => BbPromise.bind(this)
        .then(this.compileRestApi)
        .then(this.compileDeployment)
        .then(this.compileStage)
        .then(this.compileBasePathMapping)
        .then(this.compileResource)
        .then(this.compileMethod)
        .then(this.compilePermission),
    };
  }
}

module.exports = AwsCompileApigEvents;
