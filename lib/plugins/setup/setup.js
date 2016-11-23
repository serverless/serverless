'use strict';

const BbPromise = require('bluebird');

// class wide constants
const validProviders = [
  'aws',
];

// TODO: update to look like the list in the "create" plugin
// once more than one provider is supported
const humanReadableProvidersList = `"${validProviders.slice(-1)}"`;

class Setup {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      setup: {
        usage: 'Sets up a new provider profile for the Serverless Framework',
        lifecycleEvents: [
          'setup',
        ],
        options: {
          provider: {
            usage: `Name of the provider. Supported providers: ${humanReadableProvidersList}`,
            required: true,
            shortcut: 'p',
          },
        },
      },
    };

    this.hooks = {
      'before:setup:setup': () => BbPromise.bind(this)
        .then(this.validate),
    };
  }

  validate() {
    const provider = this.options.provider.toLowerCase();

    if (validProviders.indexOf(provider) === -1) {
      const errorMessage = [
        `Provider "${provider}" is not supported.`,
        ` Supported providers are: ${humanReadableProvidersList}.`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    return BbPromise.resolve();
  }
}

module.exports = Setup;
