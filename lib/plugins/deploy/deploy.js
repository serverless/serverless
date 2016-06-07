'use strict';

class Deploy {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      deploy: {
        usage: 'Deploy Service.',
        lifecycleEvents: [
          'compileFunctions',
          'deploy',
        ],
      },
    };
  }
}

module.exports = Deploy;
