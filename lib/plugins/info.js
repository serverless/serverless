'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Info {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      info: {
        ...cliCommandsSchema.get('info'),
        lifecycleEvents: ['info'],
      },
    };
  }
}

module.exports = Info;
