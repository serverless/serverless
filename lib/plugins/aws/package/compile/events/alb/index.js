'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const validateAuthorizers = require('./lib/validateAuthorizers');
const compileTargetGroups = require('./lib/targetGroups');
const compileListenerRules = require('./lib/listenerRules');
const compilePermissions = require('./lib/permissions');

class AwsCompileAlbEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validateAuthorizers,
      validate,
      compileTargetGroups,
      compileListenerRules,
      compilePermissions
    );

    this.hooks = {
      'package:compileEvents': () => {
        return BbPromise.try(() => {
          this.validatedAuthorizers = this.validateAuthorizers();
          this.validated = this.validate();
          if (this.validated.events.length === 0) return;

          this.compileTargetGroups();
          this.compileListenerRules();
          this.compilePermissions();
        });
      },
    };
  }
}

module.exports = AwsCompileAlbEvents;
