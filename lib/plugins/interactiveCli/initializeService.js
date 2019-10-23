'use strict';

const { join } = require('path');
const chalk = require('chalk');
const inquirer = require('./inquirer');
const createFromTemplate = require('../../utils/createFromTemplate');
const {
  getConfigFilePath,
  getServerlessConfigFile,
} = require('../../utils/getServerlessConfigFile');
const { confirm } = require('./utils');

const isValidServiceName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);

const initializeProjectChoices = [
  { name: 'AWS Node.js', value: 'aws-nodejs' },
  { name: 'AWS Python', value: 'aws-python3' },
  { name: 'Other', value: 'other' },
];

const projectTypeChoice = () =>
  inquirer
    .prompt({
      message: 'What do you want to make?',
      type: 'list',
      name: 'projectType',
      choices: module.exports.initializeProjectChoices,
    })
    .then(({ projectType }) => projectType);

const projectNameInput = workingDir =>
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
        return getConfigFilePath(join(workingDir, input)).then(configFilePath => {
          return configFilePath ? `Serverless project already found at ${input} directory` : true;
        });
      },
    })
    .then(({ projectName }) => projectName.trim());

module.exports = {
  initializeProjectChoices,
  check(serverless) {
    return !serverless.config.servicePath;
  },
  run(serverless) {
    const workingDir = process.cwd();
    return confirm('No project detected. Do you want to create a new one?', {
      name: 'shouldCreateNewProject',
    }).then(isConfirmed => {
      if (!isConfirmed) return null;
      return projectTypeChoice().then(projectType => {
        if (projectType === 'other') {
          process.stdout.write(
            '\nRun “serverless create --help” to view available templates and create a new project ' +
              'from one of those templates.\n'
          );
          return null;
        }
        return projectNameInput(workingDir).then(projectName => {
          const projectDir = join(workingDir, projectName);
          return createFromTemplate(projectType, projectDir)
            .then(() => {
              process.stdout.write(
                `\n${chalk.green(`Project successfully created in '${projectName}' folder.`)}\n`
              );

              process.chdir(projectDir);
              serverless.config.servicePath = projectDir;
              getServerlessConfigFile.cache.delete(serverless);
              getServerlessConfigFile(serverless);
            })
            .then(serverlessConfigFile => {
              serverless.pluginManager.serverlessConfigFile = serverlessConfigFile;
              return serverless.service.load();
            })
            .then(() => serverless.variables.populateService())
            .then(() => {
              serverless.service.mergeArrays();
              serverless.service.setFunctionNames();
              serverless.service.validate();
            });
        });
      });
    });
  },
};
