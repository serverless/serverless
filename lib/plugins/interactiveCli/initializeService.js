'use strict';

const { join } = require('path');
const chalk = require('chalk');
const fs = require('fs');
const inquirer = require('@serverless/utils/inquirer');
const resolveConfigurationPath = require('../../../lib/cli/resolve-configuration-path');
const readConfiguration = require('../../../lib/configuration/read');
const createFromTemplate = require('../../utils/createFromTemplate');
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

        try {
          await fs.promises.access(join(workingDir, input));
          return `Path ${input} is already taken`;
        } catch {
          return true;
        }
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
    serverless.configurationPath = await resolveConfigurationPath();
    serverless.config.servicePath = projectDir;
    serverless.configurationInput = await readConfiguration(serverless.configurationPath);
    await serverless.service.load();
    await serverless.variables.populateService();
    serverless.service.mergeArrays();
    serverless.service.setFunctionNames();
    // TODO: Temporary workaround for https://github.com/serverless/serverless/issues/8257
    serverless.service.configValidationMode = 'off';
    await serverless.service.validate();
  },
};
