'use strict';

class Rollback {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      rollback: {
        usage: 'Rollback the Serverless service to a specific deployment',
        configDependent: true,
        lifecycleEvents: ['initialize', 'rollback'],
        options: {
          timestamp: {
            usage: 'Timestamp of the deployment (list deployments with `serverless deploy list`)',
            shortcut: 't',
            required: false,
          },
          verbose: {
            usage: 'Show all stack events during deployment',
            shortcut: 'v',
          },
        },
        commands: {
          function: {
            usage: 'Rollback the function to the previous version',
            lifecycleEvents: ['rollback'],
            options: {
              'function': {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              'function-version': {
                usage: 'Version of the function',
                required: true,
              },
              'stage': {
                usage: 'Stage of the function',
                shortcut: 's',
              },
              'region': {
                usage: 'Region of the function',
                shortcut: 'r',
              },
            },
          },
        },
      },
    };
  }
}

module.exports = Rollback;
