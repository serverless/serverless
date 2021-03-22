'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Info {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      info: {
        ...cliCommandsSchema.get('info'),
      },
    };
  }
}

module.exports = Info;
