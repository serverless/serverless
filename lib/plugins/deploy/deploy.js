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
            required: true,
          },
          region: {
            usage: 'Region of the service',
            required: true,
          },
        },
      },
    };
  }
}

module.exports = Deploy;