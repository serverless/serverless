'use strict';

const cliCommandsSchema = require('../cli/commands-schema');
const { writeText } = require('@serverless/utils/log');

class Monitor {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.cache = {};

    this.commands = {
      monitor: {
        ...cliCommandsSchema.get('monitor'),
      },
    };
    this.hooks = {
      'monitor:monitor': this.monitor.bind(this),
    };
  }

  async monitor() {
    writeText('hello world');
  }
}

module.exports = Monitor;
