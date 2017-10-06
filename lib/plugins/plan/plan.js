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
          'plan',
          'finalize',
        ],
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          package: {
            usage: 'Path of the deployment package',
            shortcut: 'p',
          },
          verbose: {
            usage: 'Show all stack events during deployment',
            shortcut: 'v',
          },
          force: {
            usage: 'Forces a deployment to take place',
          },
          function: {
            usage: 'Function name. Deploys a single function (see \'deploy function\')',
            shortcut: 'f',
          },
        },
        commands: {},
      },
    };

    this.hooks = {
      'before:plan:plan': () => BbPromise.bind(this).then(this.validate)
    };
  }
}

module.exports = Plan;
