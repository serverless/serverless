'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const os = require('os');

class Init {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      init: {
        usage: 'Initializes a provider with the Serverless Framework',
        lifecycleEvents: [
          'init',
        ],
        options: {
          provider: {
            usage: 'Name of the provider',
            required: true,
            shortcut: 'p',
          },
          key: {
            usage: 'Access key for the provider',
            shortcut: 'k',
          },
          secret: {
            usage: 'Secret key for the provider',
            shortcut: 's',
          },
        },
      },
    };

    this.hooks = {
      'init:init': () => BbPromise.bind(this)
        .then(this.init),
    };
  }

  init() {
    // Sanitize
    this.options.provider = this.options.provider.toLowerCase();

    // Validate
    if (['aws'].indexOf(this.options.provider) < 0) {
      throw new this.serverless.classes.Error('Only \'aws\' is supported at this time.');
    }

    // Init AWS
    return this.initAws();
  }

  /**
   * Init AWS
   * - Saves AWS API Keys to a profile on the file system
   */

  initAws() {
    // Validate
    if (!this.options.key || !this.options.secret) {
      throw new this.serverless.classes.Error('Please include --key and --secret options for AWS.');
    }

    // Inform
    this.serverless.cli.log('Initializing AWS...');
    this.serverless.cli.log('Storing an AWS profile on your local file system in' +
      ' \'~/.aws/credentials\'...');

    // Locate home directory on user's machine
    const env = process.env;
    const home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

    if (!home) {
      throw new this.serverless.classes.Error('Can\'t find home directory ' +
        'on your local file system.');
    }

    // Check if ~/.aws/credentials exists
    const configDir = path.join(home, '.aws');
    const credsPath = path.join(configDir, 'credentials');

    if (this.serverless.utils.fileExistsSync(credsPath)) {
      // Check if credentials files contains anything
      const credsFile = this.serverless.utils.readFileSync(credsPath);

      // If credentials file is malformed, throw error and give guidance
      if ((credsFile.length && credsFile.indexOf('aws_access_key_id=') < 0) ||
        (credsFile.length && credsFile.indexOf('aws_secret_access_key=') < 0)) {
        // TODO: Add guidance in error message when the serverless error parser gets neater
        throw new this.serverless.classes.Error('~/.aws/credentials exists, but it\'s ' +
          'formatted incorrectly.  Open it and make sure it\'s correctly formatted.');
      }

      // If credentials file exists and is fine, say so, then exit
      if (credsFile.length) {
        this.serverless.cli.log('Exiting... ~/.aws/credentials exists and is formatted ' +
          'correctly.  Make sure you\'re using the correct profile in your serverless.yml');
        return BbPromise.resolve();
      }
    }

    // Write credentials file with 'default' profile
    this.serverless.utils.writeFileSync(
      credsPath,
      `[default]
aws_access_key_id=${this.options.key}
aws_secret_access_key=${this.options.secret}
`); // Keep line break at the end.  Otherwise can break AWS CLI.

    // Inform
    this.serverless.cli.log('Success!  ~/.aws/credentials was created and your access keys ' +
      'were stored under the \'default\' profile.');

    return BbPromise.resolve();
  }
}

module.exports = Init;
