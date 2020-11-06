'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

const validate = require('./lib/validate');
const compileTargetGroups = require('./lib/targetGroups');
const compileListenerRules = require('./lib/listenerRules');
const compilePermissions = require('./lib/permissions');

class AwsCompileAlbEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, compileTargetGroups, compileListenerRules, compilePermissions);

    // TODO: Complete schema, see https://github.com/serverless/serverless/issues/8020
    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alb', { type: 'object' });

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.service.provider.name === 'aws' &&
          _.values(_.get(this.serverless.service.provider.alb, 'authorizers') || {}).some(
            ({ allowUnauthenticated }) => allowUnauthenticated != null
          )
        ) {
          this.serverless._logDeprecation(
            'AWS_ALB_ALLOW_UNAUTHENTICATED',
            'allowUnauthenticated is deprecated, use onUnauthenticatedRequest instead'
          );
        }
      },
      'package:compileEvents': () => {
        return BbPromise.try(() => {
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
