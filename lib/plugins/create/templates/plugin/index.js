'use strict';

// https://github.com/serverless/serverless/blob/master/docs/04-extending-serverless/01-creating-plugins.md
class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      deploy: {
        lifecycleEvents: [
          'functions',
        ],
        options: {
          function: {
            usage:
              'Specify the function you want to deploy '
              + '(e.g. "--function myFunction" or "-f myFunction")',
            required: true,
            shortcut: 'f',
          },
        },
      },
    };

    this.hooks = {
      'deploy:functions': this.deployFunction.bind(this),
    };
  }

  deployFunction() {
    this.serverless.cli.log(`Deploying function: ${this.options.function}`);
  }
}

module.exports = ServerlessPlugin;
