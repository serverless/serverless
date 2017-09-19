'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../utils/userStats');

// class wide constants
const validProviders = [
  'aws',
  'spotinst',
];

// TODO: update to look like the list in the "create" plugin
// once more than one provider is supported
const humanReadableProvidersList = `"${validProviders.slice(-1)}"`;

class Config {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      config: {
        usage: 'Configure Serverless',
        commands: {
          credentials: {
            usage: 'Configures a new provider profile for the Serverless Framework',
            lifecycleEvents: [
              'config',
            ],
            options: {
              provider: {
                usage: `Name of the provider. Supported providers: ${humanReadableProvidersList}`,
                required: true,
                shortcut: 'p',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:config:credentials:config': () => BbPromise.bind(this).then(this.validate),
      'after:config:credentials:config': () => BbPromise.bind(this).then(this.track),
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

  track() {
    const sls = this.serverless;
    if (sls && sls.processedInput && sls.processedInput.options) {
      const opts = sls.processedInput.options;
      if (opts.provider === 'aws') {
        userStats.track('user_awsCredentialsConfigured');
      }
      // TODO add other providers here when supported
    }
    return BbPromise.resolve();
  }
}

module.exports = Config;
