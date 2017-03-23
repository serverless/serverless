'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const os = require('os');

class AwsConfigCredentials {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    // Note: we're not setting the provider here as this plugin should also be
    // run when the CWD is not an AWS service

    // this will be merged with the core config commands
    this.commands = {
      config: {
        commands: {
          credentials: {
            lifecycleEvents: [
              'config',
            ],
            options: {
              key: {
                usage: 'Access key for the provider',
                shortcut: 'k',
                required: true,
              },
              secret: {
                usage: 'Secret key for the provider',
                shortcut: 's',
                required: true,
              },
              profile: {
                usage: 'Name of the profile you wish to create. Defaults to "default"',
                shortcut: 'n',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'config:credentials:config': () => BbPromise.bind(this)
        .then(this.configureCredentials),
    };
  }

  configureCredentials() {
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

    if (!os.homedir()) {
      throw new this.serverless.classes
        .Error('Can\'t find home directory on your local file system.');
    }

    // check if ~/.aws/credentials exists
    const configDir = path.join(os.homedir(), '.aws');
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
    } else {
      // create the credentials file alongside the .aws directory if it's not yet present
      fse.ensureFileSync(credsPath);
    }

    // write credentials file with 'default' profile
    this.serverless.utils.appendFileSync(
      credsPath,
      `[${this.options.profile}]
aws_access_key_id=${this.options.key}
aws_secret_access_key=${this.options.secret}
`); // Keep line break at the end. Otherwise will break AWS CLI.

    this.serverless.cli.log(
      `Success! Your AWS access keys were stored under the "${this.options.profile}" profile.`);

    return BbPromise.resolve();
  }
}

module.exports = AwsConfigCredentials;
