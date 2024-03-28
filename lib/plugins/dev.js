'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Dev {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      dev: {
        ...cliCommandsSchema.get('dev'),
      },
    };
  }
}

module.exports = Dev;
