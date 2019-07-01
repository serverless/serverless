'use strict';

const BbPromise = require('bluebird');
const os = require('os');
const credentials = require('../utils/credentials');

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
            lifecycleEvents: ['config'],
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
              overwrite: {
                usage: 'Overwrite the existing profile configuration in the credentials file',
                shortcut: 'o',
              },
            },
          },
        },
      },
    };

    if (!os.homedir()) {
      throw new this.serverless.classes.Error(
        "Can't find home directory on your local file system."
      );
    }

    this.hooks = {
      'config:credentials:config': () => this.configureCredentials(),
    };
  }

  configureCredentials() {
    return BbPromise.try(() => {
      // sanitize
      this.options.provider = this.options.provider.toLowerCase();
      this.options.profile = this.options.profile ? this.options.profile : 'default';

      // resolve if provider option is not 'aws'
      if (this.options.provider !== 'aws') return null;

      // validate
      if (!this.options.key || !this.options.secret) {
        throw new this.serverless.classes.Error(
          'Please include --key and --secret options for AWS.'
        );
      }

      this.serverless.cli.log('Setting up AWS...');

      return credentials.resolveFileProfiles().then(profiles => {
        if (profiles.has(this.options.profile)) {
          // Only update the profile if the overwrite flag was set
          if (!this.options.overwrite) {
            const message = [
              `Failed! ~/.aws/credentials already has a "${this.options.profile}" profile.`,
              ' Use the overwrite flag ("-o" or "--overwrite") to force the update',
            ].join('');
            this.serverless.cli.log(message);
            return null;
          }
        }
        profiles.set(this.options.profile, {
          accessKeyId: this.options.key,
          secretAccessKey: this.options.secret,
        });

        return credentials.saveFileProfiles(profiles);
      });
    });
  }
}

module.exports = AwsConfigCredentials;
