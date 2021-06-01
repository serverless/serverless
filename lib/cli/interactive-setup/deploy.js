'use strict';

const Serverless = require('../../Serverless');
const chalk = require('chalk');
const { confirm } = require('./utils');
const _ = require('lodash');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const { getDashboardInteractUrl } = require('@serverless/dashboard-plugin/lib/dashboard');
const AWS = require('aws-sdk');

const printMessage = ({
  serviceName,
  hasBeenDeployed,
  dashboardPlugin,
  isConfiguredWithDashboard,
}) => {
  if (isConfiguredWithDashboard) {
    if (hasBeenDeployed) {
      process.stdout.write(
        `\n${chalk.green('Your project is live and available in ')}${chalk.white.bold(
          `./${serviceName}`
        )}\n`
      );
      process.stdout.write(`\n  Run ${chalk.bold('serverless info')} in the project directory\n`);
      process.stdout.write('    View your endpoints and services\n');
      process.stdout.write(`\n  Open ${chalk.bold(getDashboardInteractUrl(dashboardPlugin))}\n`);
      process.stdout.write('    Invoke your functions and view logs in the dashboard\n');
      process.stdout.write(`\n  Run ${chalk.bold('serverless deploy')} in the project directory\n`);
      process.stdout.write(
        "    Redeploy your service after you've updated your service code or configuration\n\n"
      );

      return;
    }

    process.stdout.write(
      `\n${chalk.green('Your project is ready for deployment and available in ')}${chalk.white.bold(
        `./${serviceName}`
      )}\n`
    );
    process.stdout.write(`\n  Run ${chalk.bold('serverless deploy')} in the project directory\n`);
    process.stdout.write('    Deploy your newly created service\n');
    process.stdout.write(
      `\n  Run ${chalk.bold('serverless info')} in the project directory after deployment\n`
    );
    process.stdout.write('    View your endpoints and services\n');
    process.stdout.write('\n  Open Serverless Dashboard after deployment\n');
    process.stdout.write('    Invoke your functions and view logs in the dashboard\n\n');
    return;
  }

  if (hasBeenDeployed) {
    process.stdout.write(
      `\n${chalk.green('Your project is live and available in ')}${chalk.white.bold(
        `./${serviceName}`
      )}\n`
    );
    process.stdout.write(`\n  Run ${chalk.bold('serverless info')} in the project directory\n`);
    process.stdout.write('    View your endpoints and services\n');
    process.stdout.write(`\n  Run ${chalk.bold('serverless deploy')} in the directory\n`);
    process.stdout.write(
      "    Redeploy your service after you've updated your service code or configuration\n"
    );
    process.stdout.write(
      `\n  Run ${chalk.bold('serverless invoke')} and ${chalk.bold(
        'serverless logs'
      )} in the project directory\n`
    );
    process.stdout.write('    Invoke your functions directly and view the logs\n');
    process.stdout.write(`\n  Run ${chalk.bold('serverless')} in the project directory\n`);
    process.stdout.write(
      '    Add metrics, alerts, and a log explorer, by enabling the dashboard functionality\n\n'
    );
    return;
  }

  process.stdout.write(
    `\n${chalk.green('Your project is ready for deployment and available in ')}${chalk.white.bold(
      `./${serviceName}`
    )}\n`
  );
  process.stdout.write(`\n  Run ${chalk.bold('serverless deploy')} in the project directory\n`);
  process.stdout.write('    Deploy your newly created service\n');
  process.stdout.write(
    `\n  Run ${chalk.bold('serverless info')} in the project directory after deployment\n`
  );
  process.stdout.write('    View your endpoints and services\n');
  process.stdout.write(
    `\n  Run ${chalk.bold('serverless invoke')} and ${chalk.bold(
      'serverless logs'
    )} in the project directory after deployment\n`
  );
  process.stdout.write('    Invoke your functions directly and view the logs\n');
  process.stdout.write(`\n  Run ${chalk.bold('serverless')} in the project directory\n`);
  process.stdout.write(
    '    Add metrics, alerts, and a log explorer, by enabling the dashboard functionality\n\n'
  );
};

const configurePlugin = (serverless, originalStdWrite) => {
  serverless.pluginManager.addPlugin(require('../../plugins/deploy-interactive'));
  const interactivePlugin = serverless.pluginManager.plugins.find(
    (plugin) => plugin.constructor.name === 'InteractiveDeployProgress'
  );
  interactivePlugin.progress._writeOriginalStdout = (data) => originalStdWrite(data);
  return interactivePlugin;
};

module.exports = {
  isApplicable({ configuration, serviceDir, history }) {
    if (!serviceDir) {
      return false;
    }

    // We only want to consider newly created services for deploy step
    if (!history.has('service')) {
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      return false;
    }

    // If `awsCredentials` step was not executed, we should proceed as it means that user has available credentials
    if (!history.has('awsCredentials')) return true;

    // We want to proceed if local credentials are available
    if (new AWS.Config().credentials) return true;

    // We want to proceed only if user created or linked already existing provider in `awsCredentials` step
    const awsCredentialsHistory = history.get('awsCredentials');
    const hasUserCreatedOrUsedExistingProvider = awsCredentialsHistory.some((historyItem) => {
      const hasUserLinkedExisting =
        historyItem.type === 'event' && historyItem.name === 'existingProviderLinked';
      const hasUserCreated = historyItem.type === 'event' && historyItem.name === 'providerCreated';
      return hasUserCreated || hasUserLinkedExisting;
    });
    if (hasUserCreatedOrUsedExistingProvider) return true;

    return false;
  },
  async run({ configuration, configurationFilename, serviceDir }) {
    const serviceName = configuration.service;
    if (!(await confirm('Do you want to deploy your project?', { name: 'shouldDeploy' }))) {
      printMessage({
        serviceName,
        hasBeenDeployed: false,
        isConfiguredWithDashboard: Boolean(configuration.org),
      });
      return;
    }

    const serverless = new Serverless({
      configuration,
      serviceDir,
      configurationFilename,
      isConfigurationResolved: true,
      hasResolvedCommandsExternally: true,
      isTelemetryReportedExternally: true,
      commands: ['deploy'],
      options: {},
    });

    let interactiveOutputPlugin;

    try {
      await overrideStdoutWrite(
        () => {},
        async (originalStdWrite) => {
          await serverless.init();
          interactiveOutputPlugin = configurePlugin(serverless, originalStdWrite);
          await serverless.run();
        }
      );
    } catch (err) {
      interactiveOutputPlugin.handleError();
      throw err;
    }

    printMessage({
      serviceName,
      hasBeenDeployed: true,
      isConfiguredWithDashboard: Boolean(configuration.org),
      dashboardPlugin: serverless.pluginManager.dashboardPlugin,
    });
  },
};
