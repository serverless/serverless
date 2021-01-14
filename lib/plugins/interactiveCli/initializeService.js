'use strict';

const { join } = require('path');
const chalk = require('chalk');
const inquirer = require('@serverless/utils/inquirer');
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

const projectTypeChoice = async () =>
  (
    await inquirer.prompt({
      message: 'What do you want to make?',
      type: 'list',
      name: 'projectType',
      choices: module.exports.initializeProjectChoices,
    })
  ).projectType;

const projectNameInput = async (workingDir) =>
  (
    await inquirer.prompt({
      message: 'What do you want to call this project?',
      type: 'input',
      name: 'projectName',
      validate: async (input) => {
        input = input.trim();
        if (!isValidServiceName(input)) {
          return (
            'Project name is not valid.\n' +
            '   - It should only contain alphanumeric and hyphens.\n' +
            '   - It should start with an alphabetic character.\n' +
            "   - Shouldn't exceed 128 characters"
          );
        }
        const configFilePath = await getConfigFilePath(join(workingDir, input));
        return configFilePath ? `Serverless project already found at ${input} directory` : true;
      },
    })
  ).projectName.trim();

module.exports = {
  initializeProjectChoices,
  check(serverless) {
    return !serverless.config.servicePath;
  },
  async run(serverless) {
    const workingDir = process.cwd();
    const isConfirmed = await confirm('No project detected. Do you want to create a new one?', {
      name: 'shouldCreateNewProject',
    });
    if (!isConfirmed) return;
    const projectType = await projectTypeChoice();
    if (projectType === 'other') {
      process.stdout.write(
        '\nRun “serverless create --help” to view available templates and create a new project ' +
          'from one of those templates.\n'
      );
      return;
    }
    const projectName = await projectNameInput(workingDir);
    const projectDir = join(workingDir, projectName);
    await createFromTemplate(projectType, projectDir);
    process.stdout.write(
      `\n${chalk.green(`Project successfully created in '${projectName}' folder.`)}\n`
    );

    process.chdir(projectDir);
    serverless.config.servicePath = projectDir;
    getServerlessConfigFile.delete(serverless);
    const serverlessConfigFile = await getServerlessConfigFile(serverless);
    serverless.pluginManager.serverlessConfigFile = serverlessConfigFile;
    await serverless.service.load();
    await serverless.variables.populateService();
    serverless.service.mergeArrays();
    serverless.service.setFunctionNames();
    // TODO: Temporary workaround for https://github.com/serverless/serverless/issues/8257
    serverless.service.configValidationMode = 'off';
    await serverless.service.validate();
  },
};
