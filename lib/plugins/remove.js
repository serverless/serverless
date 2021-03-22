'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Remove {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      remove: {
        ...cliCommandsSchema.get('remove'),
      },
    };
  }
}

module.exports = Remove;
