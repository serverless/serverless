'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Metrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      metrics: {
        ...cliCommandsSchema.get('metrics'),
      },
    };
  }
}

module.exports = Metrics;
