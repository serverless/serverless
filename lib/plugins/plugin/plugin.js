'use strict';

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = Object.assign({}, options);

    this.commands = {
      plugin: { type: 'container' },
    };
  }
}

module.exports = Plugin;
