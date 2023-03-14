'use strict';

const cliCommandsSchema = require('../cli/commands-schema');
const launchDevMode = require('./../cli/interactive-setup');

class Dev {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      dev: {
        ...cliCommandsSchema.get('dev'),
      },
    };

    this.hooks = {
      'dev:dev': this.launchDevMode.bind(this),
    };
  }

  async launchDevMode() {
    this.options.dev = true;
    const context = {
      serverless: this.serverless,
      options: this.options,
      isConsole: true,
      serviceDir: true,
      commandUsage: {},
    };
    await launchDevMode(context);
  }
}

module.exports = Dev;
