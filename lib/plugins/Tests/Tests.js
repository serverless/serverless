'use strict';

class Tests {
  constructor() {
    this.commands = {
      test: {
        commands: {
          integration: {
            usage: 'Command for integration testing.',
            lifeCycleEvents: [
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
    console.log(JSON.stringify(output));
  }
}

module.exports = Tests;
