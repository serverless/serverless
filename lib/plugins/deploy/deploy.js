'use strict';

const BbPromise = require('bluebird');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.commands = {
      deploy: {
        usage: 'Deploy a Serverless service',
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
        },
        commands: {
          function: {
            usage: 'Deploy a single function from the service',
            lifecycleEvents: [
              'initialize',
              'packageFunction',
              'deploy',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              stage: {
                usage: 'Stage of the function',
                shortcut: 's',
              },
              region: {
                usage: 'Region of the function',
                shortcut: 'r',
              },
            },
          },
          list: {
            usage: 'List deployed version of your Serverless Service',
            lifecycleEvents: [
              'log',
            ],
          },
        },
      },
    };

    this.hooks = {
      'before:deploy:deploy': () => BbPromise.bind(this)
      .then(() => {
        if (!this.options.package && !this.serverless.service.package.path) {
          return this.serverless.pluginManager.spawn('package');
        }
        return BbPromise.resolve();
      }),
    };
  }
}

module.exports = Deploy;
