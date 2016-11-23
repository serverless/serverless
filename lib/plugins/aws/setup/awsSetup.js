'use strict';

const BbPromise = require('bluebird');
const path = require('path');

class AwsSetup {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    // Note: we're not setting the provider here as this plugin should also be
    // run when the PWD is not an AWS service

    // this will be merged with the core setup commands
    this.commands = {
      setup: {
        lifecycleEvents: [
          'setup',
        ],
        options: {
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
      'setup:setup': () => BbPromise.bind(this)
        .then(this.setupAws),
    };
  }

  setupAws() {
    // sanitize
    this.options.provider = this.options.provider.toLowerCase();
    this.options.profile = this.options.profile ? this.options.profile : 'default';

    // resolve if provider option is not 'aws'
    if (this.options.provider !== 'aws') {
      return BbPromise.resolve();
    }

    // validate
    if (!this.options.key || !this.options.secret) {
      throw new this.serverless.classes.Error('Please include --key and --secret options for AWS.');
    }

    this.serverless.cli.log('Setting up AWS...');
    this.serverless.cli.log('Saving your AWS profile in "~/.aws/credentials"...');

    // locate home directory on user's machine
    const env = process.env;
    const home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

    if (!home) {
      throw new this.serverless.classes
        .Error('Can\'t find home directory on your local file system.');
    }

    // check if ~/.aws/credentials exists
    const configDir = path.join(home, '.aws');
    const credsPath = path.join(configDir, 'credentials');

    if (this.serverless.utils.fileExistsSync(credsPath)) {
      // check if credentials files contains anything
      const credsFile = this.serverless.utils.readFileSync(credsPath);

      // if credentials file exists w/ profile, exit
      if (credsFile.length && credsFile.indexOf(`[${this.options.profile}]`) > -1) {
        this.serverless.cli.log(
          `Failed! ~/.aws/credentials exists and already has a "${this.options.profile}" profile.`);
        return BbPromise.resolve();
      }
    }

    // write credentials file with 'default' profile
    this.serverless.utils.appendFileSync(
      credsPath,
      `[${this.options.profile}]
aws_access_key_id=${this.options.key}
aws_secret_access_key=${this.options.secret}
`); // Keep line break at the end.  Otherwise will break AWS CLI.

    this.serverless.cli.log(
      `Success! Your AWS access keys were stored under the "${this.options.profile}" profile.`);

    return BbPromise.resolve();
  }
}

module.exports = AwsSetup;
