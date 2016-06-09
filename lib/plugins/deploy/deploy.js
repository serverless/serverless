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
      },
    };
  }
}

module.exports = Deploy;
