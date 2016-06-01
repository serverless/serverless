'use strict';

class Tests {
  constructor() {
    this.commands = {
      test: {
        commands: {
          integration: {
            usage: 'Command for integration testing.',
            lifecycleEvents: [
              'logCommandsOnConsole',
            ],
          },
        },
      },
    };

    this.hooks = {
      'test:integration:logCommandsOnConsole': this.logCommandsOnConsole.bind(this),
    };
  }

  logCommandsOnConsole() {
    const output = this.commands;

    // Note: This console.log is necessary so that the integration for
    // the CLI can read and parse the console output
    console.log(JSON.stringify(output)); // eslint-disable-line
  }
}

module.exports = Tests;
