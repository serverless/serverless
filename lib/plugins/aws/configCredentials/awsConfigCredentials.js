'use strict';

const BbPromise = require('bluebird');
const constants = require('constants');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const _ = require('lodash');

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
      throw new this.serverless.classes
        .Error('Can\'t find home directory on your local file system.');
    }

    this.credentialsFilePath = path.join(os.homedir(), '.aws', 'credentials');
    // Create the credentials file alongside the .aws directory if it's not yet present
    fse.ensureFileSync(this.credentialsFilePath);

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

    this.credentials = this.getCredentials();

    // Get the profile start line and end line numbers inside the credentials array
    const profileBoundaries = this.getProfileBoundaries();

    // Check if the profile exists
    const isNewProfile = profileBoundaries.start === -1;
    if (isNewProfile) {
      this.addProfile();
    } else {
      // Only update the profile if the overwrite flag was set
      if (!this.options.overwrite) {
        const message = [
          `Failed! ~/.aws/credentials already has a "${this.options.profile}" profile.`,
          ' Use the overwrite flag ("-o" or "--overwrite") to force the update',
        ].join('');
        this.serverless.cli.log(message);
        return BbPromise.resolve();
      }

      this.updateProfile(profileBoundaries);
    }

    return this.saveCredentialsFile();
  }

  getCredentials() {
    // Get the credentials file lines
    const credentialsFileContent = this.serverless.utils.readFileSync(this.credentialsFilePath);
    return credentialsFileContent ? credentialsFileContent.split('\n') : [];
  }

  addProfile() {
    this.credentials.push(`[${this.options.profile}]`,
      `aws_access_key_id = ${this.options.key}`,
      `aws_secret_access_key = ${this.options.secret}`);
  }

  updateProfile(profileBoundries) {
    let currentLine = profileBoundries.start;
    let endLine = profileBoundries.end;

    // Remove existing 'aws_access_key_id' and 'aws_secret_access_key' properties
    while (currentLine < endLine) {
      const line = this.credentials[currentLine];
      if (
        line.indexOf('aws_access_key_id') > -1 ||
        line.indexOf('aws_secret_access_key') > -1
      ) {
        this.credentials.splice(currentLine, 1);
        endLine--;
      } else {
        currentLine++;
      }
    }

    // Add the key and the secret to the beginning of the section
    const keyLine = `aws_access_key_id = ${this.options.key}`;
    const secretLine = `aws_secret_access_key = ${this.options.secret}`;

    this.credentials.splice(profileBoundries.start + 1, 0, secretLine);
    this.credentials.splice(profileBoundries.start + 1, 0, keyLine);
  }

  saveCredentialsFile() {
    // Generate the file content and add a line break at the end
    const updatedCredsFileContent = `${this.credentials.join('\n')}\n`;

    this.serverless.cli.log('Saving your AWS profile in "~/.aws/credentials"...');

    return this.serverless.utils.writeFile(this.credentialsFilePath, updatedCredsFileContent)
      .then(() => {
        // set file permissions to only readable/writable by owner (equivalent to 'chmod 600')
        // NOTE: `chmod` doesn't behave as intended on Windows, so skip if we're on Windows.
        if (os.platform() !== 'win32') {
          fs.chmodSync(
            this.credentialsFilePath,
            (fs.constants || constants).S_IRUSR | (fs.constants || constants).S_IWUSR
          );
        }

        this.serverless.cli.log(
          `Success! Your AWS access keys were stored under the "${this.options.profile}" profile.`);
      });
  }

  getProfileBoundaries() {
    // Get the line number of the aws profile definition, defaults to -1
    const start = this.credentials.indexOf(`[${this.options.profile}]`);

    const nextProfile = _.findIndex(this.credentials, line => /\[[^\]]+\]/.test(line), start + 1);
    // Get the line number of the next aws profile definition, defaults to the file lines number
    const end = nextProfile + 1 || this.credentials.length;

    return { start, end };
  }

}

module.exports = AwsConfigCredentials;
