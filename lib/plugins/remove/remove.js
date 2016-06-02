'use strict';

class Remove {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      remove: {
        usage: 'Remove resources.',
        lifecycleEvents: [
          'remove',
        ],
      },
    };
  }
}

module.exports = Remove;
