'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const inquirer = require('./inquirer');
const awsCredentials = require('../aws/utils/credentials');
const { confirm } = require('./utils');
const openBrowser = require('../../utils/openBrowser');

const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/+]{10,}$/);

const awsAccessKeyIdInput = () =>
  inquirer
    .prompt({
      message: 'AWS Access Key Id:',
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
      message: 'AWS Secret Access Key:',
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
      ]).then(
        ([fileProfiles, envCredentials]) =>
          !fileProfiles.size && !envCredentials && !serverless.getProvider('aws').cachedCredentials
      );
    });
  },
  run(serverless) {
    process.stdout.write(
      'No AWS credentials were found on your computer, ' +
        'you need these to host your application.\n\n'
    );
    return confirm('Do you want to set them up now?')
      .then(isConfirmed => {
        if (!isConfirmed) {
          process.stdout.write(`You can setup your AWS account later. More details available here:

http://slss.io/aws-creds-setup`);
        }
        return isConfirmed;
      })
      .then(isConfirmed => {
        if (!isConfirmed) return null;
        return confirm('Do you have an AWS account?')
          .then(hasAccount => {
            if (!hasAccount) {
              return openBrowser('https://portal.aws.amazon.com/billing/signup').then(() =>
                inquirer.prompt({
                  message: 'Press Enter to continue after creating an AWS account',
                  name: 'junk',
                })
              );
            }
            return null;
          })
          .then(() => {
            const region = serverless.getProvider('aws').getRegion();
            return openBrowser(
              `https://console.aws.amazon.com/iam/home?region=${region}#/users$new?step=final&accessKey&userNames=serverless&permissionType=policies&policies=arn:aws:iam::aws:policy%2FAdministratorAccess`
            );
          })
          .then(() =>
            inquirer.prompt({
              message: 'Press Enter to continue after creating an AWS user with access keys',
              name: 'junk',
            })
          )
          .then(() => {
            return awsAccessKeyIdInput().then(accessKeyId =>
              awsSecretAccessKeyInput().then(secretAccessKey =>
                awsCredentials
                  .saveFileProfiles(new Map([['default', { accessKeyId, secretAccessKey }]]))
                  .then(() =>
                    process.stdout.write(
                      `\n${chalk.green(
                        `AWS credentials saved on your machine at ${chalk.bold(
                          '~/.aws/credentials'
                        )}. Go there to change them at any time.`
                      )}\n`
                    )
                  )
              )
            );
          });
      });
  },
};
