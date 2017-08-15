'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const userStats = require('../../utils/userStats');

class Invoke {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      invoke: {
        usage: 'Invoke a deployed function',
        lifecycleEvents: [
          'invoke',
        ],
        options: {
          function: {
            usage: 'The function name',
            required: true,
            shortcut: 'f',
          },
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          path: {
            usage: 'Path to JSON or YAML file holding input data',
            shortcut: 'p',
          },
          type: {
            usage: 'Type of invocation',
            shortcut: 't',
          },
          log: {
            usage: 'Trigger logging data output',
            shortcut: 'l',
          },
          data: {
            usage: 'input data',
            shortcut: 'd',
          },
        },
        commands: {
          local: {
            usage: 'Invoke function locally',
            lifecycleEvents: [
              'loadEnvVars',
              'invoke',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              path: {
                usage: 'Path to JSON or YAML file holding input data',
                shortcut: 'p',
              },
              data: {
                usage: 'input data',
                shortcut: 'd',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'invoke:local:loadEnvVars': () => BbPromise.bind(this).then(this.loadEnvVarsForLocal),
      'after:invoke:invoke': () => BbPromise.bind(this).then(this.trackInvoke),
      'after:invoke:local:invoke': () => BbPromise.bind(this).then(this.trackInvokeLocal),
    };
  }

  trackInvoke() {
    userStats.track('service_invoked');
    return BbPromise.resolve();
  }

  trackInvokeLocal() {
    userStats.track('service_invokedLocally');
    return BbPromise.resolve();
  }

  /**
   * Set environment variables for "invoke local" that are provider independent.
   */
  loadEnvVarsForLocal() {
    const defaultEnvVars = {
      IS_LOCAL: 'true',
    };

    _.merge(process.env, defaultEnvVars);

    return BbPromise.resolve();
  }
}

module.exports = Invoke;
