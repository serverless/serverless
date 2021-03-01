'use strict';

const chalk = require('chalk');
const inquirer = require('@serverless/utils/inquirer');
const awsCredentials = require('../aws/utils/credentials');
const { confirm } = require('./utils');
const openBrowser = require('../../utils/openBrowser');

const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/+]{10,}$/);

async function awsAccessKeyIdInput() {
  const { accessKeyId } = await inquirer.prompt({
    message: 'AWS Access Key Id:',
    type: 'input',
    name: 'accessKeyId',
    validate(input) {
      if (isValidAwsAccessKeyId(input.trim())) return true;
      return 'AWS Access Key Id seems not valid.\n   Expected something like AKIAIOSFODNN7EXAMPLE';
    },
  });

  return accessKeyId.trim();
}

async function awsSecretAccessKeyInput() {
  const { secretAccessKey } = await inquirer.prompt({
    message: 'AWS Secret Access Key:',
    type: 'input',
    name: 'secretAccessKey',
    validate(input) {
      if (isValidAwsSecretAccessKey(input.trim())) return true;
      return (
        'AWS Secret Access Key seems not valid.\n' +
        '   Expected something like wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      );
    },
  });

  return secretAccessKey.trim();
}

const steps = {
  writeOnSetupSkip() {
    process.stdout.write(`\nYou can setup your AWS account later. More details available here:

  http://slss.io/aws-creds-setup\n`);
  },
  async shouldSetupAwsCredentials() {
    const isConfirmed = await confirm('Do you want to set them up now?', {
      name: 'shouldSetupAwsCredentials',
    });

    if (!isConfirmed) steps.writeOnSetupSkip();
    return isConfirmed;
  },
  async ensureAwsAccount() {
    const hasAccount = await confirm('Do you have an AWS account?', { name: 'hasAwsAccount' });

    if (!hasAccount) {
      await openBrowser('https://portal.aws.amazon.com/billing/signup');
      return inquirer.prompt({
        message: 'Press Enter to continue after creating an AWS account',
        name: 'createAwsAccountPrompt',
      });
    }
    return null;
  },
  async ensureAwsCredentials(serverless) {
    const region = serverless.getProvider('aws').getRegion();
    await openBrowser(
      `https://console.aws.amazon.com/iam/home?region=${region}#/users$new?step=final&accessKey&userNames=serverless&permissionType=policies&policies=arn:aws:iam::aws:policy%2FAdministratorAccess`
    );
    return inquirer.prompt({
      message: 'Press Enter to continue after creating an AWS user with access keys',
      name: 'generateAwsCredsPrompt',
    });
  },
  async inputAwsCredentials() {
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
  async check(serverless) {
    if (serverless.service.provider.name !== 'aws') return false;
    if (serverless.getProvider('aws').cachedCredentials) return false;
    const [fileProfiles, envCredentials] = await Promise.all([
      awsCredentials.resolveFileProfiles(),
      awsCredentials.resolveEnvCredentials(),
    ]);
    return !fileProfiles.size && !envCredentials;
  },
  async run(serverless) {
    process.stdout.write(
      'No AWS credentials were found on your computer, ' +
        'you need these to host your application.\n\n'
    );
    await module.exports.runSteps(serverless);
  },
  steps,
  async runSteps(serverless) {
    const isConfirmed = await steps.shouldSetupAwsCredentials();

    if (!isConfirmed) return;
    await steps.ensureAwsAccount();
    await steps.ensureAwsCredentials(serverless);
    await steps.inputAwsCredentials();
  },
};
