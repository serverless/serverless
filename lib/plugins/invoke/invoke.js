'use strict';

class Invoke {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      invoke: {
        usage: 'Invoke a deployed function',
        lifecycleEvents: [
          'invoke',
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
          path: {
            usage: 'Path to JSON file holding input data',
            shortcut: 'p',
          },
          type: {
            usage: 'Type of invocation',
            shortcut: 't',
          },
          log: {
            usage: 'Trigger logging data output',
            shortcut: 'l',
          },
        },
        commands: {
          local: {
            usage: 'Invoke lambda locally',
            lifecycleEvents: [
              'invoke',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
              },
              path: {
                usage: 'Path to JSON file holding input data',
                shortcut: 'p',
              },
              data: {
                usage: 'input data',
                shortcut: 'd',
              },
            },
          },
        },
      },
    };
  }
}

module.exports = Invoke;
