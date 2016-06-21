'use strict';

class Deploy {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      deploy: {
        usage: 'Deploy Service.',
        lifecycleEvents: [
          'initializeResources',
          'createProviderStacks',
          'compileFunctions',
          'compileEvents',
          'deploy',
        ],
        options: {
          stage: {
            usage: 'Stage of the service',
          },
          region: {
            usage: 'Region of the service',
          },
        },
      },
    };
  }
}

module.exports = Deploy;
