'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const compileTargetGroups = require('./lib/targetGroups');
const compileListeners = require('./lib/listeners');
const compilePermissions = require('./lib/permissions');

class AwsCompileAlbEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      compileTargetGroups,
      compileListeners,
      compilePermissions
    );

    this.hooks = {
      'package:compileEvents': () => {
        this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileTargetGroups)
          .then(this.compileListeners)
          .then(this.compilePermissions);
      },
    };
  }
}

module.exports = AwsCompileAlbEvents;
