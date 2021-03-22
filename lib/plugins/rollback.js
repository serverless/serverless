'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Rollback {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      rollback: {
        ...cliCommandsSchema.get('rollback'),
        commands: {
          function: {
            ...cliCommandsSchema.get('rollback function'),
          },
        },
      },
    };
  }
}

module.exports = Rollback;
