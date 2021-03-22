'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Logs {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      logs: {
        ...cliCommandsSchema.get('logs'),
      },
    };
  }
}

module.exports = Logs;
