'use strict';

const generateAnalyticsPayload = require('../../utils/analytics/generatePayload');
const { report: analyticsReport } = require('../../utils/analytics');
const processBackendNotificationRequest = require('../../utils/processBackendNotificationRequest');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.commands = {
      deploy: {
        usage: 'Deploy a Serverless service',
        configDependent: true,
        lifecycleEvents: [
          'deprecated#cleanup->package:cleanup',
          'deprecated#initialize->package:initialize',
          'deprecated#setupProviderConfiguration->package:setupProviderConfiguration',
          'deprecated#createDeploymentArtifacts->package:createDeploymentArtifacts',
          'deprecated#compileFunctions->package:compileFunctions',
          'deprecated#compileEvents->package:compileEvents',
          'deploy',
          'finalize',
        ],
        options: {
          'conceal': {
            usage: 'Hide secrets from the output (e.g. API Gateway key values)',
          },
          'stage': {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          'region': {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          'package': {
            usage: 'Path of the deployment package',
            shortcut: 'p',
          },
          'verbose': {
            usage: 'Show all stack events during deployment',
            shortcut: 'v',
          },
          'force': {
            usage: 'Forces a deployment to take place',
          },
          'function': {
            usage: "Function name. Deploys a single function (see 'deploy function')",
            shortcut: 'f',
          },
          'aws-s3-accelerate': {
            usage: 'Enables S3 Transfer Acceleration making uploading artifacts much faster.',
          },
        },
        commands: {
          function: {
            usage: 'Deploy a single function from the service',
            lifecycleEvents: ['initialize', 'packageFunction', 'deploy'],
            options: {
              'function': {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              'stage': {
                usage: 'Stage of the function',
                shortcut: 's',
              },
              'region': {
                usage: 'Region of the function',
                shortcut: 'r',
              },
              'force': {
                usage: 'Forces a deployment to take place',
              },
              'update-config': {
                usage:
                  'Updates function configuration, e.g. Timeout or Memory Size without deploying code', // eslint-disable-line max-len
                shortcut: 'u',
              },
            },
          },
          list: {
            usage: 'List deployed version of your Serverless Service',
            lifecycleEvents: ['log'],
            commands: {
              functions: {
                usage: 'List all the deployed functions and their versions',
                lifecycleEvents: ['log'],
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
          throw new this.serverless.classes.Error(errorMessage);
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
          this.deferredBackendNotificationRequest = analyticsReport(
            Object.assign(await generateAnalyticsPayload(this.serverless), { command: 'deploy' })
          );
        }
      },
      'after:deploy:finalize': () => {
        if (!this.deferredBackendNotificationRequest) return null;
        return this.deferredBackendNotificationRequest.then(processBackendNotificationRequest);
      },
    };
  }
}

module.exports = Deploy;
