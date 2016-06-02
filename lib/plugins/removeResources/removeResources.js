'use strict';

class RemoveResources {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      deploy: {
        usage: 'Remove resources.',
        lifecycleEvents: [
          'removeResources',
        ],
      },
    };
  }
}

module.exports = RemoveResources;
