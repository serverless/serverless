'use strict';

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      one: {
        usage: 'test plugin',
        lifecycleEvents: [
          'hello',
        ],
      },
    };

    this.hooks = {
      'before:one:hello': this.beforeWelcome.bind(this),
    };
  }

  beforeWelcome() {
    this.serverless.cli.log('plugin one ran successfully!');
  }
}

module.exports = ServerlessPlugin;
