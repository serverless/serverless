'use strict';

const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');

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
        const isDeployCommand =
          this.serverless.processedInput.commands.length === 1 &&
          this.serverless.processedInput.commands[0] === 'deploy';
        if (isDeployCommand && this.options.function) {
          this.serverless._logDeprecation(
            'CLI_DEPLOY_FUNCTION_OPTION',
            'Starting with v3.0.0, `--function` or `-f` option for `deploy` command will be removed. In order to deploy a single function, please use `deploy function` command instead.'
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
