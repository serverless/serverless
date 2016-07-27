'use strict';

class Logs {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      logs: {
        usage: 'Outputs the logs of a deployed function.',
        lifecycleEvents: [
          'logs',
        ],
        options: {
          function: {
            usage: 'The function name',
            required: true,
            shortcut: 'f',
          },
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          tail: {
            usage: 'Tail the log output',
            shortcut: 't',
          },
          duration: {
            usage: 'Duration. Default: `5m`',
            shortcut: 'd',
          },
          filter: {
            usage: 'A filter pattern',
            shortcut: 'l',
          },
          pollInterval: {
            usage: 'Tail polling interval in milliseconds. Default: `1000`',
            shortcut: 'i',
          },
        },
      },
    };
  }
}

module.exports = Logs;
