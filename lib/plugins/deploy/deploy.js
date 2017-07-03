'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');
const validate = require('../lib/validate');

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    Object.assign(
      this,
      validate
    );

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
          force: {
            usage: 'Forces a deployment to take place',
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
              force: {
                usage: 'Forces a deployment to take place',
              },
            },
          },
          list: {
            usage: 'List deployed version of your Serverless Service',
            lifecycleEvents: [
              'log',
            ],
            commands: {
              functions: {
                usage: 'List all the deployed functions and their versions',
                lifecycleEvents: [
                  'log',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(this.validate)
        .then(() => {
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
