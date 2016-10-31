'use strict';

class Rollback {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      rollback: {
        usage: 'Rollback the Serverless service to a specific deployment',
        lifecycleEvents: [
          'initialize',
          'rollback',
        ],
        options: {
          timestamp: {
            usage: 'Timestamp of the deployment (list deployments with `serverless deploy list`)',
            shortcut: 't',
            required: true,
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

module.exports = Rollback;
