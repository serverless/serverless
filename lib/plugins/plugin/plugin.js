'use strict';

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      plugin: { type: 'container' },
    };
  }
}

module.exports = Plugin;
