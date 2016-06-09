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

module.exports = Remove;
