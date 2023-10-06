'use strict';

const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const { awsRequest } = require('./../cli/interactive-setup/utils');

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

    this.resolveAwsAccountId = async (context) => {
      try {
        return (await awsRequest(context, 'STS', 'getCallerIdentity')).Account;
      } catch (error) {
        throw new Error('Could not determine AWS Account Id');
      }
    };

    this.hooks = {
      'before:deploy:deploy': async () => {
        const provider = this.serverless.service.provider.name;
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`;
          throw new ServerlessError(errorMessage, 'INVALID_PROVIDER');
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('package');
        }
      },
      'after:deploy:deploy': async () => {
        return true;
      },
    };
  }
}

module.exports = Deploy;
