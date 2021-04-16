'use strict';

const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const generateTelemetryPayload = require('../utils/telemetry/generatePayload');
const { report: telemetryReport } = require('../utils/telemetry');
const processBackendNotificationRequest = require('../utils/processBackendNotificationRequest');

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
      'before:deploy:deploy': async () => {
        const provider = this.serverless.service.provider.name;
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`;
          throw new ServerlessError(errorMessage);
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

        try {
          if (!this.options.package && !this.serverless.service.package.path) {
            await this.serverless.pluginManager.spawn('package');
          }
        } finally {
          this.deferredBackendNotificationRequest = telemetryReport(
            Object.assign(await generateTelemetryPayload(this.serverless), { command: 'deploy' })
          );
        }
      },
      'after:deploy:finalize': async () => {
        if (!this.deferredBackendNotificationRequest) return null;
        return this.deferredBackendNotificationRequest.then(processBackendNotificationRequest);
      },
    };
  }
}

module.exports = Deploy;
