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
      },
    };
  }
}

module.exports = Invoke;
