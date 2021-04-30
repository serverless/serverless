'use strict';

const chalk = require('chalk');
const _ = require('lodash');
const inquirer = require('@serverless/utils/inquirer');

const AWS = require('aws-sdk');

const awsCredentials = require('../../plugins/aws/utils/credentials');
const { confirm } = require('./utils');
const openBrowser = require('../../utils/openBrowser');

const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/+]{10,}$/);

const awsAccessKeyIdInput = async () =>
  (
    await inquirer.prompt({
      message: 'AWS Access Key Id:',
      type: 'input',
      name: 'accessKeyId',
      validate: (input) => {
        if (isValidAwsAccessKeyId(input.trim())) return true;
        return 'AWS Access Key Id seems not valid.\n   Expected something like AKIAIOSFODNN7EXAMPLE';
      },
    })
  ).accessKeyId.trim();

const awsSecretAccessKeyInput = async () =>
  (
    await inquirer.prompt({
      message: 'AWS Secret Access Key:',
      type: 'input',
      name: 'secretAccessKey',
      validate: (input) => {
        if (isValidAwsSecretAccessKey(input.trim())) return true;
        return (
          'AWS Secret Access Key seems not valid.\n' +
          '   Expected something like wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        );
      },
    })
  ).secretAccessKey.trim();

const steps = {
  writeOnSetupSkip: () =>
    process.stdout.write(`\nYou can setup your AWS account later. More details available here:

  http://slss.io/aws-creds-setup\n`),

  shouldSetupAwsCredentials: async () => {
    if (await confirm('Do you want to set them up now?', { name: 'shouldSetupAwsCredentials' })) {
      return true;
    }
    steps.writeOnSetupSkip();
    return false;
  },

  ensureAwsAccount: async () => {
    if (await confirm('Do you have an AWS account?', { name: 'hasAwsAccount' })) return;
    openBrowser('https://portal.aws.amazon.com/billing/signup');
    await inquirer.prompt({
      message: 'Press Enter to continue after creating an AWS account',
      name: 'createAwsAccountPrompt',
    });
  },
  ensureAwsCredentials: async ({ options, configuration }) => {
    const region = options.region || configuration.provider.region || 'us-east-1';
    openBrowser(
      `https://console.aws.amazon.com/iam/home?region=${region}#/users$new?step=final&accessKey&userNames=serverless&permissionType=policies&policies=arn:aws:iam::aws:policy%2FAdministratorAccess`
    );
    await inquirer.prompt({
      message: 'Press Enter to continue after creating an AWS user with access keys',
      name: 'generateAwsCredsPrompt',
    });
  },
  inputAwsCredentials: async () => {
    const accessKeyId = await awsAccessKeyIdInput();
    const secretAccessKey = await awsSecretAccessKeyInput();
    await awsCredentials.saveFileProfiles(new Map([['default', { accessKeyId, secretAccessKey }]]));
    process.stdout.write(
      `\n${chalk.green(
        `AWS credentials saved on your machine at ${chalk.bold(
          process.platform === 'win32' ? '%userprofile%\\.aws\\credentials' : '~/.aws/credentials'
        )}. Go there to change them at any time.`
      )}\n`
    );
  },
};

module.exports = {
  async isApplicable({ configuration }) {
    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      return false;
    }
    if (new AWS.S3().config.credentials) return false;
    return !(await awsCredentials.resolveFileProfiles()).size;
  },
  async run(data) {
    process.stdout.write(
      'No AWS credentials were found on your computer, ' +
        'you need these to host your application.\n\n'
    );

    return module.exports.runSteps(data);
  },
  steps,
  runSteps: async (context) => {
    if (!(await steps.shouldSetupAwsCredentials())) return;
    await steps.ensureAwsAccount();

    await steps.ensureAwsCredentials(context);
    await steps.inputAwsCredentials();
  },
};
