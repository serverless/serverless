'use strict';

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      two: {
        usage: 'test plugin',
        lifecycleEvents: [
          'hello',
        ],
      },
    };

    this.hooks = {
      'before:two:hello': this.beforeWelcome.bind(this),
    };
  }

  beforeWelcome() {
    this.serverless.cli.log('plugin two ran successfully!');
  }
}

module.exports = ServerlessPlugin;
