'use strict';

class Greeter {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      greet: {
        lifecycleEvents: [
          'greet',
        ],
      },
    };

    this.hooks = {
      'greet:greet': this.greet.bind(this),
    };
  }

  greet() {
    process.stdout.write('Hello from the greeter plugin!');
  }
}

module.exports = Greeter;
