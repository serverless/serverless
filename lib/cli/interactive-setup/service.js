'use strict';

const { join } = require('path');
const chalk = require('chalk');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { legacy, log, progress } = require('@serverless/utils/log');
const resolveConfigurationPath = require('../resolve-configuration-path');
const readConfiguration = require('../../configuration/read');
const resolveVariables = require('../../configuration/variables');
const createFromLocalTemplate = require('../../utils/create-from-local-template');
const npmCommandDeferred = require('../../utils/npm-command-deferred');
const ServerlessError = require('../../serverless-error');
const { downloadTemplateFromRepo } = require('../../utils/downloadTemplateFromRepo');

const isValidServiceName = RegExp.prototype.test.bind(/^[a-zA-Z][a-zA-Z0-9-]{0,100}$/);

const initializeProjectChoices = [
  { name: 'AWS - Node.js - Starter', value: 'aws-node' },
  { name: 'AWS - Node.js - HTTP API', value: 'aws-node-http-api' },
  { name: 'AWS - Node.js - Scheduled Task', value: 'aws-node-scheduled-cron' },
  { name: 'AWS - Node.js - SQS Worker', value: 'aws-node-sqs-worker' },
  { name: 'AWS - Node.js - Express API', value: 'aws-node-express-api' },
  { name: 'AWS - Node.js - Express API with DynamoDB', value: 'aws-node-express-dynamodb-api' },

  { name: 'AWS - Python - Starter', value: 'aws-python' },
  { name: 'AWS - Python - HTTP API', value: 'aws-python-http-api' },
  { name: 'AWS - Python - Scheduled Task', value: 'aws-python-scheduled-cron' },
  { name: 'AWS - Python - SQS Worker', value: 'aws-python-sqs-worker' },
  { name: 'AWS - Python - Flask API', value: 'aws-python-flask-api' },
  { name: 'AWS - Python - Flask API with DynamoDB', value: 'aws-python-flask-dynamodb-api' },
  { name: 'Other', value: 'other' },
];

const projectTypeChoice = async (stepHistory) => {
  const projectType = await promptWithHistory({
    message: 'What do you want to make?',
    type: 'list',
    name: 'projectType',
    choices: initializeProjectChoices,
    pageSize: 13,
    recordRawAnswerInHistory: true,
    stepHistory,
  });
  return projectType;
};

const INVALID_PROJECT_NAME_MESSAGE =
  'Project name is not valid.\n' +
  '   - It should only contain alphanumeric and hyphens.\n' +
  '   - It should start with an alphabetic character.\n' +
  "   - Shouldn't exceed 128 characters";

const projectNameInput = async (workingDir, projectType, stepHistory) => {
  const projectName = await promptWithHistory({
    message: 'What do you want to call this project?',
    type: 'input',
    name: 'projectName',
    stepHistory,
    default: projectType ? `${projectType}-project` : null,
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
  });
  return projectName;
};

const resolveProjectNameInput = async ({ options, workingDir, projectType, stepHistory }) => {
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

  return projectNameInput(workingDir, projectType, stepHistory);
};

module.exports = {
  isApplicable(context) {
    const { options, serviceDir } = context;
    const notApplicableOptions = new Set(['name', 'template-path', 'template', 'template-url']);
    if (serviceDir && Object.keys(options).some((key) => notApplicableOptions.has(key))) {
      throw new ServerlessError(
        `Cannot setup a new service when being in context of another service (${[
          ...notApplicableOptions,
        ]
          .map((opt) => `"--${opt}"`)
          .join(', ')} options cannot be applied)`,
        'NOT_APPLICABLE_SERVICE_OPTIONS'
      );
    }

    const inServiceDir = Boolean(serviceDir);
    if (inServiceDir) {
      context.inapplicabilityReasonCode = 'IN_SERVICE_DIRECTORY';
    }
    return !inServiceDir;
  },
  async run(context) {
    const workingDir = context.cwd || process.cwd();

    log.notice('Creating a new serverless project');
    log.notice();

    // Validate if user did not provide more than one of: `template', 'template-url` and `template-path` options
    const templateOptions = new Set(['template-path', 'template', 'template-url']);
    if (Object.keys(context.options).filter((key) => templateOptions.has(key)).length > 1) {
      throw new ServerlessError(
        `You can provide only one of: ${[...templateOptions]
          .map((opt) => `"--${opt}"`)
          .join(', ')} options`,
        'MULTIPLE_TEMPLATE_OPTIONS_PROVIDED'
      );
    }

    let projectDir;
    let projectName;
    if (context.options['template-path']) {
      projectName = await resolveProjectNameInput({
        options: context.options,
        workingDir,
        stepHistory: context.stepHistory,
      });
      projectDir = join(workingDir, projectName);
      await createFromLocalTemplate({
        templatePath: context.options['template-path'],
        projectDir,
        projectName,
      });
    } else if (context.options['template-url']) {
      projectName = await resolveProjectNameInput({
        options: context.options,
        workingDir,
        stepHistory: context.stepHistory,
      });
      projectDir = join(workingDir, projectName);
      const templateUrl = context.options['template-url'];
      legacy.write(`\nDownloading template from provided url: ${templateUrl}...\n`);
      const downloadProgress = progress.get('template-download');
      downloadProgress.notice(`Downloading template from provided url: ${templateUrl}`);
      try {
        await downloadTemplateFromRepo(templateUrl, null, projectName, { silent: true });
      } catch (err) {
        if (err.constructor.name !== 'ServerlessError') throw err;

        throw new ServerlessError(
          `Could not download template from provided url. Ensure that the template provided with "--template-url" exists: ${err.message}`,
          'INVALID_TEMPLATE_URL'
        );
      }
      downloadProgress.remove();
    } else {
      let projectType;
      if (context.options.template) {
        projectType = context.options.template;
      } else {
        projectType = await projectTypeChoice(context.stepHistory);
        if (projectType === 'other') {
          legacy.write(
            '\nRun “serverless create --help” to view available templates and create a new project ' +
              'from one of those templates.\n'
          );
          log.notice();
          log.notice(
            'Run "serverless create --help" to view available templates and create a new project ' +
              'from one of those templates.'
          );
          return;
        }
      }
      projectName = await resolveProjectNameInput({
        options: context.options,
        workingDir,
        projectType,
        stepHistory: context.stepHistory,
      });
      projectDir = join(workingDir, projectName);
      const templateUrl = `https://github.com/serverless/examples/tree/v2/${projectType}`;
      legacy.write(`\nDownloading "${projectType}" template...\n`);
      const downloadProgress = progress.get('template-download');
      downloadProgress.notice(`Downloading "${projectType}" template`);
      try {
        await downloadTemplateFromRepo(templateUrl, projectType, projectName, { silent: true });
      } catch (err) {
        if (err.code === 'ENOENT' && context.options.template) {
          throw new ServerlessError(
            'Could not find provided template. Ensure that the template provided with "--template" exists.',
            'INVALID_TEMPLATE'
          );
        }

        if (err.constructor.name !== 'ServerlessError') throw err;

        throw new ServerlessError(
          `Could not download template. Ensure that you are using the latest version of Serverless Framework: ${err.message}`,
          'TEMPLATE_DOWNLOAD_FAILED'
        );
      }
      downloadProgress.remove();
    }

    let hasPackageJson = false;
    try {
      await fsp.access(join(projectDir, 'package.json'));
      hasPackageJson = true;
    } catch {
      // pass
    }

    if (hasPackageJson) {
      legacy.write(`\nInstalling dependencies with "npm" in "${projectName}" folder\n`);
      const installProgress = progress.get('npm-install');
      installProgress.notice(`Installing dependencies with "npm" in "${projectName}" folder`);
      const { command, args } = await npmCommandDeferred;
      try {
        await spawn(command, [...args, 'install'], { cwd: projectDir });
      } catch (err) {
        if (err.code === 'ENOENT') {
          legacy.write(
            `\n${chalk.yellow(
              'Cannot install dependencies as "npm" installation could not be found. Please install npm and run "npm install" in directory of created service.'
            )}\n`
          );
          log.warning();
          log.warning(
            'Cannot install dependencies as "npm" installation could not be found. Please install npm and run "npm install" in directory of created service.'
          );
        } else {
          throw new ServerlessError(
            `Cannot install dependencies: ${err.message}`,
            'DEPENDENCIES_INSTALL_FAILED'
          );
        }
      }
      installProgress.remove();
    }

    try {
      // Try to remove `serverless.template.yml` file from created project if its present
      await fsp.unlink(join(projectDir, 'serverless.template.yml'));
    } catch {
      // pass
    }

    legacy.write(
      `\n${chalk.green(
        `Project successfully created in ${chalk.white.bold(projectName)} folder`
      )}\n`
    );
    log.notice();
    log.notice.success(`Project successfully created in ${projectName} folder`);
    context.serviceDir = projectDir;
    const configurationPath = await resolveConfigurationPath({ cwd: projectDir, options: {} });
    context.configurationFilename = configurationPath.slice(projectDir.length + 1);
    context.configuration = await readConfiguration(configurationPath);
    await resolveVariables(context);
  },
  configuredQuestions: ['projectType', 'projectName'],
};
