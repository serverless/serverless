'use strict';

const { join } = require('path');
const chalk = require('chalk');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const inquirer = require('@serverless/utils/inquirer');
const resolveConfigurationPath = require('../resolve-configuration-path');
const readConfiguration = require('../../configuration/read');
const resolveVariables = require('../../configuration/variables');
const { confirm } = require('./utils');
const createFromLocalTemplate = require('../../utils/create-from-local-template');
const npmCommandDeferred = require('../../utils/npm-command-deferred');
const ServerlessError = require('../../serverless-error');
const { downloadTemplateFromRepo } = require('../../utils/downloadTemplateFromRepo');

const isValidServiceName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);

const initializeProjectChoices = [
  { name: 'AWS - Node.js - Empty', value: 'aws-node' },
  { name: 'AWS - Node.js - REST API', value: 'aws-node-rest-api' },
  { name: 'AWS - Node.js - Scheduled Task', value: 'aws-node-scheduled-cron' },
  { name: 'AWS - Node.js - SQS Worker', value: 'aws-node-sqs-worker' },
  { name: 'AWS - Node.js - Express API', value: 'aws-node-express-api' },
  { name: 'AWS - Node.js - Express API with DynamoDB', value: 'aws-node-express-dynamodb-api' },

  { name: 'AWS - Python - Empty', value: 'aws-python' },
  { name: 'AWS - Python - REST API', value: 'aws-python-rest-api' },
  { name: 'AWS - Python - Scheduled Task', value: 'aws-python-scheduled-cron' },
  { name: 'AWS - Python - SQS Worker', value: 'aws-python-sqs-worker' },
  { name: 'AWS - Python - Flask API', value: 'aws-python-flask-api' },
  { name: 'AWS - Python - Flask API with DynamoDB', value: 'aws-python-flask-dynamodb-api' },
  { name: 'Other', value: 'other' },
];

const projectTypeChoice = async () =>
  (
    await inquirer.prompt({
      message: 'What do you want to make?',
      type: 'list',
      name: 'projectType',
      choices: initializeProjectChoices,
      pageSize: 13,
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
          await fsp.access(join(workingDir, input));
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
      await fsp.access(join(workingDir, options.name));
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
      const templateUrl = `https://github.com/serverless/examples/tree/master/${projectType}`;
      try {
        process.stdout.write(`\n${chalk.green(`Downloading "${projectType}" template...`)}\n`);
        await downloadTemplateFromRepo(templateUrl, projectType, projectName, { silent: true });
      } catch (err) {
        throw new ServerlessError(
          'Could not download template. Ensure that you are using the latest version of Serverless Framework.',
          'TEMPLATE_DOWNLOAD_FAILED'
        );
      }
    }

    let hasPackageJson = false;
    try {
      await fsp.access(join(projectDir, 'package.json'));
      hasPackageJson = true;
    } catch {
      // pass
    }

    if (hasPackageJson) {
      process.stdout.write(
        `\n${chalk.green(`Installing dependencies with "npm" in "${projectName}" folder.`)}\n`
      );
      const npmCommand = await npmCommandDeferred;
      try {
        await spawn(npmCommand, ['install'], { cwd: projectDir });
      } catch (err) {
        if (err.code === 'ENOENT') {
          process.stdout.write(
            `\n${chalk.yellow(
              'Cannot install dependencies as "npm" installation could not be found. Please install npm and run "npm install" in directory of created service.'
            )}\n`
          );
        } else {
          throw new ServerlessError(
            `Cannot install dependencies: ${err.message}`,
            'DEPENDENCIES_INSTALL_FAILED'
          );
        }
      }
    }

    try {
      // Try to remove `serverless.template.yml` file from created project if its present
      await fsp.unlink(join(projectDir, 'serverless.template.yml'));
    } catch {
      // pass
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
