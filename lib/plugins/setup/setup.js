'use strict';

class Setup {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      setup: {
        usage: 'Sets up a new provider profile for the Serverless Framework',
        lifecycleEvents: [
          'setup',
        ],
        options: {
          provider: {
            usage: 'Name of the provider',
            required: true,
            shortcut: 'p',
          },
        },
      },
    };
  }
}

module.exports = Setup;
