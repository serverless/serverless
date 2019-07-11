'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');

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
      'before:deploy:deploy': () =>
        BbPromise.bind(this).then(() => {
          const provider = this.serverless.service.provider.name;
          if (!this.serverless.getProvider(provider)) {
            const errorMessage = `The specified provider "${provider}" does not exist.`;
            return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
          }
          if (this.options.function) {
            // If the user has given a function parameter, spawn a function deploy
            // and terminate execution right afterwards. We did not enter the
            // deploy lifecycle yet, so nothing has to be cleaned up.
            return this.serverless.pluginManager.spawn('deploy:function', {
              terminateLifecycleAfterExecution: true,
            });
          }
          if (!this.options.package && !this.serverless.service.package.path) {
            return this.serverless.pluginManager.spawn('package');
          }
          return BbPromise.resolve();
        }),

      'after:deploy:deploy': () => BbPromise.bind(this).then(this.track),
    };
  }

  track() {
    const sls = this.serverless;
    let serviceInfo = {};
    if (sls && sls.service && sls.service.provider && sls.service.provider.name) {
      serviceInfo = {
        provider: sls.service.provider.name,
        runtime: sls.service.provider.runtime,
      };
    }
    userStats.track('service_deployed', {
      data: serviceInfo,
    });
    return BbPromise.resolve();
  }
}

module.exports = Deploy;
