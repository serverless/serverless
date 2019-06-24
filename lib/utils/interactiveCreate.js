'use strict';

const { join } = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const installTemplate = require('./installTemplate');
const { getConfigFilePath } = require('./getServerlessConfigFile');

const isValidServiceName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);

module.exports = path => {
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
      .then(({ projectName }) => projectName);

  return projectTypeChoice().then(projectType => {
    if (!projectType) return null;
    return projectNameInput().then(projectName => {
      const projectDir = join(process.cwd(), projectName);
      return installTemplate(projectType, projectDir).then(() => {
        process.stdout.write(
          `\n${chalk.green(`Project successfully created in '${projectName}' folder.`)}\n\n`
        );
      });
    });
  });
};
