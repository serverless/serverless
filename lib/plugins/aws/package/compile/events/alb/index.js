'use strict';

const BbPromise = require('bluebird');

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

    this.hooks = {
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

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alb', {
      type: 'object',
      properties: {
        listenerArn: { $ref: '#/definitions/awsArnString' },
    priority: {type: 'integer', minimum: 1, maximum: 50000},
    conditions:
      host: example.com
    path: /hello
    healthCheck: # optional, can also be set using a boolean value
    path: / # optional
    intervalSeconds: 35 # optional
    timeoutSeconds: 30 # optional
    healthyThresholdCount: 5 # optional
    unhealthyThresholdCount: 5 # optional
    matcher: # optional
    httpCode: '200'
      },
      required: [],
      additionalProperties: false,
    });
  }
}

module.exports = AwsCompileAlbEvents;
