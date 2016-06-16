'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;

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
      compileRestApi,
      compileResources,
      compileMethods,
      compileDeployment,
      compilePermissions
    );

    this.hooks = {
      'deploy:compileEvents': () => {
        if (!this.serverless.service.resources.aws.Resources) {
          throw new this.serverless.classes.Error(
            'This plugin needs access to Resources section of the AWS CloudFormation template');
        }

        let noEndpoints = true;

        forEach(this.serverless.service.functions, functionObj => {
          if (functionObj.events && functionObj.events.aws
            && functionObj.events.aws.http_endpoints) {
            noEndpoints = false;
          }
        });

        if (noEndpoints) return BbPromise.resolve();

        return BbPromise.bind(this)
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
