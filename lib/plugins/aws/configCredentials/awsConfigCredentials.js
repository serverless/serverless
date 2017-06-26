'use strict';

const BbPromise = require('bluebird');
const path = require('path');
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
                shortcut: 'o'
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

    // create the credentials file alongside the .aws directory if it's not yet present
    fse.ensureFileSync(credsPath);

    // check if credentials files contains anything
    const credsFile = this.serverless.utils.readFileSync(credsPath);

    // Check if the profile exists
    if (credsFile.length && credsFile.indexOf(`[${this.options.profile}]`) > -1) {

      // Update the profile if the overwrite flag was set
      if (this.options.overwrite) {
        this.updateProfile(credsPath, credsFile);
      } else {
        this.serverless.cli.log(
          `Failed! ~/.aws/credentials exists and already has a "${this.options.profile}" profile.
          If you would like to overwrite the profile, use the overwrite flag ("-o" or "--overwrite")`);
        return BbPromise.resolve();
      }

    } else {
      // if not, add the profile
      this.addProfile(credsPath);
    }

    this.serverless.cli.log(
      `Success! Your AWS access keys were stored under the "${this.options.profile}" profile.`);

    return BbPromise.resolve();
  }

  addProfile(credsPath) {

    let profileDefinition = `[${this.options.profile}]\n`;
    profileDefinition += `aws_access_key_id=${this.options.key}\n`;
    profileDefinition += `aws_secret_access_key=${this.options.secret}\n`;

    this.serverless.utils.appendFileSync(credsPath, profileDefinition);
  }

  updateProfile(credsPath, credsFile) {

    const credsLines = _.split(credsFile, '\n');
    const sectionBoundries = this.getSectionBoundaries(credsLines);

    if ( sectionBoundries.start === -1 ) {
      throw new this.serverless.classes
        .Error('Can\'t find profile to update.');
    }

    // Remove existing 'aws_access_key_id' and 'aws_secret_access_key' from the section
    let lineNumber = sectionBoundries.start;
    while (lineNumber < sectionBoundries.end) {
      if (
        credsLines[lineNumber].indexOf('aws_access_key_id') > -1 ||
        credsLines[lineNumber].indexOf('aws_secret_access_key') > -1) {
          credsLines.splice(lineNumber, 1);
          sectionBoundries.end--;
      } else {
        lineNumber++;
      }
    }

    // Add the key and the secret to the beginning of the section
    credsLines.splice(sectionBoundries.start + 1, 0, `aws_secret_access_key = ${this.options.secret}`);
    credsLines.splice(sectionBoundries.start + 1, 0, `aws_access_key_id = ${this.options.key}`);

    // Generate the file content and add a line break at the end
    let updatedCredsFile = _.join(credsLines, '\n') + '\n';

    this.serverless.utils.writeFileSync(credsPath, updatedCredsFile);
  }

  getSectionBoundaries(credsLines) {

    // Get the line number of the aws profile definition, defaults to -1
    const start = _.findIndex(credsLines, line => line === `[${this.options.profile}]`);

    // Get the number of the following aws profile definition, defaults to the file rows number
    const end = _.findIndex(credsLines, line => /\[[^\]]+\]/.test(line), start + 1) + 1 || credsLines.length;

    return { start, end };
  }

}

module.exports = AwsConfigCredentials;
