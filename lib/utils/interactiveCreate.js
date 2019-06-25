'use strict';

const { join } = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const installTemplate = require('./installTemplate');
const { getConfigFilePath } = require('./getServerlessConfigFile');
const awsCredentials = require('../plugins/aws/utils/credentials');

const isValidServiceName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);
const isValidAwsProfileName = isValidServiceName;
const isValidAwsAccessKeyId = RegExp.prototype.test.bind(/^[A-Z0-9]{10,}$/);
const isValidAwsSecretAccessKey = RegExp.prototype.test.bind(/^[a-zA-Z0-9/]{10,}$/);

module.exports = path => {
  const createConfirm = () =>
    inquirer
      .prompt({
        message: 'No Serverless project detected. Do you want to create a new one?',
        type: 'confirm',
        name: 'createWanted',
      })
      .then(({ createWanted }) => createWanted);

  const projectTypeChoice = () =>
    inquirer
      .prompt({
        message: 'What do you want to make?',
        type: 'list',
        name: 'projectType',
        choices: [
          { name: 'AWS Node.js', value: 'aws-nodejs' },
          { name: 'AWS Python', value: 'aws-python' },
          { name: 'Other', value: 'other' },
        ],
      })
      .then(({ projectType }) => {
        if (projectType === 'other') {
          process.stdout.write(
            '\nRun “serverless create --help” to view available templates and create a new project ' +
              'from one of those templates.\n\n'
          );
          return null;
        }
        return projectType;
      });

  const projectNameInput = () =>
    inquirer
      .prompt({
        message: 'What do you want to call this project?',
        type: 'input',
        name: 'projectName',
        validate: input => {
          input = input.trim();
          if (!isValidServiceName(input)) {
            return (
              'Project name is not valid.\n' +
              '   - It should only contain alphanumeric and hyphens.\n' +
              '   - It should start with an alphabetic character.\n' +
              "   - Shouldn't exceed 128 characters"
            );
          }
          return getConfigFilePath(join(path, input)).then(configFilePath => {
            return configFilePath ? `Serverless project already found at ${input} directory` : true;
          });
        },
      })
      .then(({ projectName }) => projectName.trim());

  const awsCredentialsConfirm = () =>
    inquirer
      .prompt({
        message: 'Do you want to set them up now?',
        type: 'confirm',
        name: 'awsSetupNeeded',
      })
      .then(({ awsSetupNeeded }) => awsSetupNeeded);

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
          return (
            'AWS Access Key Id seems not valid.\n' +
            '  Expected something like AKIAIOSFODNN7EXAMPLE'
          );
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
            '  Expected something like wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
          );
        },
      })
      .then(({ secretAccessKey }) => secretAccessKey.trim());

  process.stdout.write('\n');
  return createConfirm().then(createWanted => {
    if (!createWanted) return null;

    return projectTypeChoice().then(projectType => {
      if (!projectType) return null;
      return projectNameInput()
        .then(projectName => {
          const projectDir = join(process.cwd(), projectName);
          return installTemplate(projectType, projectDir).then(() => {
            process.stdout.write(
              `\n${chalk.green(`Project successfully created in '${projectName}' folder.`)}\n\n`
            );
          });
        })
        .then(() =>
          Promise.all([
            awsCredentials.resolveFileProfiles(),
            awsCredentials.resolveEnvCredentials(),
          ]).then(([fileProfiles, envCredentials]) => {
            if (fileProfiles.size || envCredentials) return null;
            process.stdout.write(
              'No AWS credentials were found on your computer, ' +
                'you need these to host your application.\n'
            );
            return awsCredentialsConfirm().then(result => {
              if (!result) return null;
              process.stdout.write(
                '\nGo here to learn how to create your AWS credentials:\n' +
                  'https://slss.io/aws-account and enter them here:\n\n'
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
                          )}\n\n`
                        )
                      )
                  )
                )
              );
            });
          })
        );
    });
  });
};
