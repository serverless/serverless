'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const inquirer = require('./inquirer');
const awsCredentials = require('../aws/utils/credentials');
const { confirm } = require('./utils');

const isValidAwsProfileName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);
const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/]{10,}$/);

const awsProfileNameInput = () =>
  inquirer
    .prompt({
      message: 'AWS Profile name',
      type: 'input',
      name: 'profileName',
      validate: input => {
        if (isValidAwsProfileName(input.trim())) return true;
        return (
          'AWS profile name is not valid.\n' +
          '   - It should only contain alphanumeric and hyphens.\n' +
          '   - It should start with an alphabetic character.\n' +
          "   - Shouldn't exceed 128 characters"
        );
      },
    })
    .then(({ profileName }) => profileName.trim());

const awsAccessKeyIdInput = () =>
  inquirer
    .prompt({
      message: 'AWS Access Key Id',
      type: 'input',
      name: 'accessKeyId',
      validate: input => {
        if (isValidAwsAccessKeyId(input.trim())) return true;
        return 'AWS Access Key Id seems not valid.\n   Expected something like AKIAIOSFODNN7EXAMPLE';
      },
    })
    .then(({ accessKeyId }) => accessKeyId.trim());

const awsSecretAccessKeyInput = () =>
  inquirer
    .prompt({
      message: 'AWS Secret Access Key',
      type: 'input',
      name: 'secretAccessKey',
      validate: input => {
        if (isValidAwsSecretAccessKey(input.trim())) return true;
        return (
          'AWS Secret Access Key seems not valid.\n' +
          '   Expected something like wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        );
      },
    })
    .then(({ secretAccessKey }) => secretAccessKey.trim());

module.exports = {
  check(serverless) {
    return BbPromise.try(() => {
      if (serverless.service.provider.name !== 'aws') return null;
      return BbPromise.all([
        awsCredentials.resolveFileProfiles(),
        awsCredentials.resolveEnvCredentials(),
      ]).then(([fileProfiles, envCredentials]) => !fileProfiles.size && !envCredentials);
    });
  },
  run() {
    process.stdout.write(
      'No AWS credentials were found on your computer, ' +
        'you need these to host your application.\n\n'
    );
    return confirm('Do you want to set them up now?').then(isConfirmed => {
      if (!isConfirmed) return null;
      process.stdout.write(
        '\nGo here to learn how to create your AWS credentials:\n' +
          'https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html#cli-quick-configuration-creds and enter them here:\n\n'
      );
      return awsProfileNameInput().then(profileName =>
        awsAccessKeyIdInput().then(accessKeyId =>
          awsSecretAccessKeyInput().then(secretAccessKey =>
            awsCredentials
              .saveFileProfiles(new Map([[profileName, { accessKeyId, secretAccessKey }]]))
              .then(() =>
                process.stdout.write(
                  `\n${chalk.green(
                    'AWS credentials saved on your machine at ~/.aws/credentials. ' +
                      'Go there to change them at any time.'
                  )}\n`
                )
              )
          )
        )
      );
    });
  },
};
