'use strict';

class Logs {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      rollback: {
        usage: 'Rollback the Serverless service to a previous version',
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
        },
      },
    };
  }
}

module.exports = Logs;
