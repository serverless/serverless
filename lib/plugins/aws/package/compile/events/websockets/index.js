'use strict';

const BbPromise = require('bluebird');

const compileApi = require('./lib/api');
const compileIntegrations = require('./lib/integrations');
const compilePermissions = require('./lib/permissions');
const compileRoutes = require('./lib/routes');
const compileDeployment = require('./lib/deployment');

class AwsCompileWebsockets {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this, // todo validate
      compileApi,
      compileIntegrations,
      compilePermissions,
      compileRoutes,
      compileDeployment,
    );

    this.hooks = {
      'package:compileEvents': () => {
        // this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileApi)
          .then(this.compileIntegrations)
          .then(this.compilePermissions)
          .then(this.compileRoutes)
          .then(this.compileDeployment);
      },
    };
  }
}

module.exports = AwsCompileWebsockets;
