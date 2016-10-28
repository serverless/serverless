'use strict';

class Deploy {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      deploy: {
        usage: 'Deploy a Serverless service',
        lifecycleEvents: [
          'cleanup',
          'initialize',
          'setupProviderConfiguration',
          'createDeploymentArtifacts',
          'compileFunctions',
          'compileEvents',
          'deploy',
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
          noDeploy: {
            usage: 'Build artifacts without deploying',
            shortcut: 'n',
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
  }
}

module.exports = Deploy;
