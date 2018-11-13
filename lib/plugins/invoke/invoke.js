'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const userStats = require('../../utils/userStats');

class Invoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.commands = {
      invoke: {
        usage: 'Invoke a deployed function',
        configDependent: true,
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
            usage: 'Input data',
            shortcut: 'd',
          },
          raw: {
            usage: 'Flag to pass input data as a raw string',
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
              raw: {
                usage: 'Flag to pass input data as a raw string',
              },
              context: {
                usage: 'Context of the service',
                shortcut: 'c',
              },
              contextPath: {
                usage: 'Path to JSON or YAML file holding context data',
                shortcut: 'x',
              },
              env: {
                usage: 'Override environment variables. e.g. --env VAR1=val1 --env VAR2=val2',
                shortcut: 'e',
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

    // Turn zero or more --env options into an array
    //   ...then split --env NAME=value and put into process.env.
    _.concat(this.options.env || [])
      .forEach(itm => {
        const splitItm = _.split(itm, '=');
        process.env[splitItm[0]] = splitItm[1] || '';
      });

    return BbPromise.resolve();
  }
}

module.exports = Invoke;
