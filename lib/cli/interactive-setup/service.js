'use strict';

const { join } = require('path');
const chalk = require('chalk');
const fs = require('fs');
const inquirer = require('@serverless/utils/inquirer');
const resolveConfigurationPath = require('../resolve-configuration-path');
const readConfiguration = require('../../configuration/read');
const createFromTemplate = require('../../utils/createFromTemplate');
const resolveVariables = require('../../configuration/variables');
const { confirm } = require('./utils');
const createFromLocalTemplate = require('../../utils/create-from-local-template');
const ServerlessError = require('../../serverless-error');

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
      choices: initializeProjectChoices,
    })
  ).projectType;

const INVALID_PROJECT_NAME_MESSAGE =
  'Project name is not valid.\n' +
  '   - It should only contain alphanumeric and hyphens.\n' +
  '   - It should start with an alphabetic character.\n' +
  "   - Shouldn't exceed 128 characters";

const projectNameInput = async (workingDir) =>
  (
    await inquirer.prompt({
      message: 'What do you want to call this project?',
      type: 'input',
      name: 'projectName',
      validate: async (input) => {
        input = input.trim();
        if (!isValidServiceName(input)) {
          return INVALID_PROJECT_NAME_MESSAGE;
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

const resolveProjectNameInput = async (options, workingDir) => {
  if (options.name) {
    if (!isValidServiceName(options.name)) {
      throw new ServerlessError(INVALID_PROJECT_NAME_MESSAGE, 'INVALID_PROJECT_NAME');
    }

    let alreadyTaken = false;
    try {
      await fs.promises.access(join(workingDir, options.name));
      alreadyTaken = true;
    } catch {
      // Pass
    }

    if (alreadyTaken) {
      throw new ServerlessError(
        `Path ${options.name} is already taken`,
        'TARGET_FOLDER_ALREADY_EXISTS'
      );
    }

    return options.name;
  }

  return projectNameInput(workingDir);
};

module.exports = {
  isApplicable({ options, serviceDir }) {
    if (serviceDir && (options.name || options['template-path'])) {
      throw new ServerlessError(
        'Cannot setup a new service when being in context of another service ("--name" and "--template-path" options cannot be applied)',
        'NOT_APPLICABLE_SERVICE_OPTIONS'
      );
    }

    return !serviceDir;
  },
  async run(context) {
    const workingDir = context.cwd || process.cwd();

    if (!context.options.name && !context.options['template-path']) {
      const isConfirmed = await confirm('No project detected. Do you want to create a new one?', {
        name: 'shouldCreateNewProject',
      });
      if (!isConfirmed) return;
    }

    let projectDir;
    let projectName;
    if (context.options['template-path']) {
      projectName = await resolveProjectNameInput(context.options, workingDir);
      projectDir = join(workingDir, projectName);
      await createFromLocalTemplate({
        templatePath: context.options['template-path'],
        projectDir,
        projectName,
      });
    } else {
      const projectType = await projectTypeChoice();
      if (projectType === 'other') {
        process.stdout.write(
          '\nRun “serverless create --help” to view available templates and create a new project ' +
            'from one of those templates.\n'
        );
        return;
      }
      projectName = await resolveProjectNameInput(context.options, workingDir);
      projectDir = join(workingDir, projectName);
      await createFromTemplate(projectType, projectDir);
    }

    process.stdout.write(
      `\n${chalk.green(`Project successfully created in '${projectName}' folder.`)}\n`
    );

    context.serviceDir = projectDir;
    const configurationPath = await resolveConfigurationPath({ cwd: projectDir, options: {} });
    context.configurationFilename = configurationPath.slice(projectDir.length + 1);
    context.configuration = await readConfiguration(configurationPath);
    await resolveVariables(context);
  },
};
