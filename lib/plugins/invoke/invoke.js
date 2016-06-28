'use strict';

class Invoke {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      invoke: {
        usage: 'Invokes a deployed function.',
        lifecycleEvents: [
          'invoke',
        ],
        options: {
          function: {
            usage: 'The function name',
            required: true,
          },
          stage: {
            usage: 'Stage of the service',
          },
          region: {
            usage: 'Region of the service',
          },
          path: {
            usage: 'Path to JSON file holding input data',
          },
          type: {
            usage: 'Type of invocation',
          },
          log: {
            usage: 'Trigger logging data output',
          },
        },
      },
    };
  }
}

module.exports = Invoke;
