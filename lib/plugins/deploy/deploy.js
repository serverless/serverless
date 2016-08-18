'use strict';

class Deploy {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      deploy: {
        usage: 'Deploy Service.',
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
        },
        commands: {
          function: {
            usage: 'Deploys a single function from the service',
            lifecycleEvents: [
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
        },
      },
    };
  }
}

module.exports = Deploy;
