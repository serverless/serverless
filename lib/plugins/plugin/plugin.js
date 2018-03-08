'use strict';

const BbPromise = require('bluebird');

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      plugin: {
        usage: 'Plugin management for Serverless',
        lifecycleEvents: [
          'plugin',
        ],
      },
    };
    this.hooks = {
      'plugin:plugin': () => {
        this.serverless.cli.generateCommandsHelp(['plugin']);
        return BbPromise.resolve();
      },
    };
  }
}

module.exports = Plugin;
