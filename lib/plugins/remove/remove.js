'use strict';

class Remove {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      remove: {
        usage: 'Remove Serverless service and all resources',
        configDependent: true,
        lifecycleEvents: ['remove'],
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          verbose: {
            usage: 'Show all stack events during deployment',
            shortcut: 'v',
          },
        },
      },
    };
  }
}

module.exports = Remove;
