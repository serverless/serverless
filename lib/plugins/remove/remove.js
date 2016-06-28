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

module.exports = Remove;
