'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');

class Plan {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    Object.assign(
      this,
      validate
    );

    this.commands = {
      plan: {
        usage: 'Plan a Serverless service',
        lifecycleEvents: [
          'deprecated#cleanup->package:cleanup',
          'deprecated#initialize->package:initialize',
          'deprecated#setupProviderConfiguration->package:setupProviderConfiguration',
          'deprecated#createDeploymentArtifacts->package:createDeploymentArtifacts',
          'deprecated#compileFunctions->package:compileFunctions',
          'deprecated#compileEvents->package:compileEvents',
          'plan',
          'finalize',
        ],
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
        },
        commands: {
          plan: {
            usage: 'Deploy a single function from the service',
            lifecycleEvents: [
              'initialize',
              'packageFunction',
              'plan',
            ],
          },
        },
      },
    };

    this.hooks = {
      'before:plan:plan': () => BbPromise.bind(this)
        .then(this.validate)
        .then(() => {
          if (!this.options.package && !this.serverless.service.package.path) {
            return this.serverless.pluginManager.spawn('package');
          }
          return BbPromise.resolve();
        }),
      // 'plan:plan': () => BbPromise.bind(this).then(() => console.log(1)),
    };
  }
}

module.exports = Plan;
