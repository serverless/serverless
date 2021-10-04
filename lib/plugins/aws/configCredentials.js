'use strict';

const os = require('os');
const credentials = require('./utils/credentials');
const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');
const { legacy, log } = require('@serverless/utils/log');

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
            ...cliCommandsSchema.get('config credentials'),
          },
        },
      },
    };

    if (!os.homedir()) {
      throw new ServerlessError(
        "Can't find home directory on your local file system.",
        'MISSING_HOME_DIRECTORY'
      );
    }

    this.hooks = {
      'config:credentials:config': async () => this.configureCredentials(),
    };
  }

  async configureCredentials() {
    // sanitize
    this.options.provider = this.options.provider.toLowerCase();
    this.options.profile = this.options.profile ? this.options.profile : 'default';

    // resolve if provider option is not 'aws'
    if (this.options.provider !== 'aws') return null;

    // validate
    if (!this.options.key || !this.options.secret) {
      throw new ServerlessError(
        'Please include --key and --secret options for AWS.',
        'MISSING_KEY_AND_SECRET_CLI_OPTIONS'
      );
    }

    legacy.log('Setting up AWS...');

    const profiles = await credentials.resolveFileProfiles();
    if (profiles.has(this.options.profile)) {
      // Only update the profile if the overwrite flag was set
      if (!this.options.overwrite) {
        throw new ServerlessError(
          `Profile "${this.options.profile}" is already configured in ~/.aws/credentials. Use the overwrite flag ("-o" or "--overwrite") to force the update.`,
          'CREDENTIALS_PROFILE_ALREADY_CONFIGURED'
        );
      }
    }
    profiles.set(this.options.profile, {
      accessKeyId: this.options.key,
      secretAccessKey: this.options.secret,
    });

    const result = await credentials.saveFileProfiles(profiles);
    log.notice.success(`Profile "${this.options.profile}" has been configured`);
    return result;
  }
}

module.exports = AwsConfigCredentials;
