'use strict';

const cliCommandsSchema = require('../cli/commands-schema');

class Metrics {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = Object.assign({}, options);

    this.commands = {
      metrics: {
        ...cliCommandsSchema.get('metrics'),
      },
    };
  }
}

module.exports = Metrics;
