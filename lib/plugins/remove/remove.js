'use strict';

class Remove {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      remove: {
        commands: {
          resources: {
            usage: 'Remove resources.',
            lifecycleEvents: [
              'removeResources',
            ],
          },
        },
      },
    };
  }
}

module.exports = Remove;
