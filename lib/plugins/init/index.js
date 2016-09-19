'use strict';

const BbPromise = require('bluebird');
const path = require('path');

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
          profile: {
            usage: 'Name of the profile you wish to create. Defaults to \'default\'',
            shortcut: 'n',
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
    this.options.profile = this.options.profile ? this.options.profile : 'default';

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
    this.serverless.cli.log('Saving your AWS profile in \'~/.aws/credentials\'...');

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

      // If credentials file exists w/ profile, exit
      if (credsFile.length
        && credsFile.indexOf(`[${this.options.profile}]`) > -1) {
        this.serverless.cli.log('Failed! ~/.aws/credentials exists and already has ' +
          `a \'${this.options.profile}\' profile.`);
        return BbPromise.resolve();
      }
    }

    // Write credentials file with 'default' profile
    this.serverless.utils.appendFileSync(
      credsPath,
      `[${this.options.profile}]
aws_access_key_id=${this.options.key}
aws_secret_access_key=${this.options.secret}
`); // Keep line break at the end.  Otherwise will break AWS CLI.

    // Inform
    this.serverless.cli.log('Success! Your AWS access keys were stored under' +
      ` the \'${this.options.profile}\' profile.`);

    return BbPromise.resolve();
  }
}

module.exports = Init;
