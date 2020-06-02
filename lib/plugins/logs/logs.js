'use strict';

class Logs {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      logs: {
        usage: 'Output the logs of a deployed function',
        configDependent: true,
        lifecycleEvents: ['logs'],
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
          startTime: {
            usage:
              'Logs before this time will not be displayed. Default: `10m` (last 10 minutes logs only)',
          },
          filter: {
            usage: 'A filter pattern',
          },
          interval: {
            usage: 'Tail polling interval in milliseconds. Default: `1000`',
            shortcut: 'i',
          },
        },
      },
    };
  }
}

module.exports = Logs;
