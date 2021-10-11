'use strict';

const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const { logWarning } = require('../classes/Error');
const { log } = require('@serverless/utils/log');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.commands = {
      deploy: {
        ...cliCommandsSchema.get('deploy'),
        commands: {
          function: {
            ...cliCommandsSchema.get('deploy function'),
          },
          list: {
            ...cliCommandsSchema.get('deploy list'),

            commands: {
              functions: {
                ...cliCommandsSchema.get('deploy list functions'),
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.processedInput.commands.join(' ') === 'deploy' &&
          this.options.function
        ) {
          logWarning(
            'Please use "deploy function -f" command directly. Support for "deploy -f" alias is likely to be removed in the future.'
          );
          log.warning(
            'Please use "deploy function -f" command directly. Support for "deploy -f" alias is likely to be removed in the future.'
          );
        }
      },
      'before:deploy:deploy': async () => {
        const provider = this.serverless.service.provider.name;
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`;
          throw new ServerlessError(errorMessage, 'INVALID_PROVIDER');
        }

        if (this.options.function) {
          // If the user has given a function parameter, spawn a function deploy
          // and terminate execution right afterwards. We did not enter the
          // deploy lifecycle yet, so nothing has to be cleaned up.
          await this.serverless.pluginManager.spawn('deploy:function', {
            terminateLifecycleAfterExecution: true,
          });
          return;
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('package');
        }
      },
    };
  }
}

module.exports = Deploy;
