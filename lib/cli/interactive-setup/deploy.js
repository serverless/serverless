'use strict';

const Serverless = require('../../Serverless');
const chalk = require('chalk');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { doesServiceInstanceHaveLinkedProvider } = require('./utils');
const _ = require('lodash');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const { getDashboardInteractUrl } = require('@serverless/dashboard-plugin/lib/dashboard');
const AWS = require('aws-sdk');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/isAuthenticated');

const printMessage = ({
  serviceName,
  hasBeenDeployed,
  dashboardPlugin,
  isConfiguredWithDashboard,
  initialContext,
}) => {
  const projectInformationSuffix = initialContext.isInServiceContext
    ? ''
    : `${chalk.green(' and available in ')}${chalk.white.bold(`./${serviceName}`)}`;

  if (isConfiguredWithDashboard) {
    if (hasBeenDeployed) {
      process.stdout.write(
        [
          `\n${chalk.green('Your project is live')}${projectInformationSuffix}`,
          `\n  Run ${chalk.bold('serverless info')} in the project directory`,
          '    View your endpoints and services',
          `\n  Open ${chalk.bold(getDashboardInteractUrl(dashboardPlugin))}`,
          '    Invoke your functions and view logs in the dashboard',
          `\n  Run ${chalk.bold('serverless deploy')} in the project directory`,
          "    Redeploy your service after you've updated your service code or configuration\n\n",
        ].join('\n')
      );

      return;
    }

    process.stdout.write(
      [
        `\n${chalk.green('Your project is ready for deployment')}${projectInformationSuffix}`,
        `\n  Run ${chalk.bold('serverless deploy')} in the project directory`,
        '    Deploy your newly created service',
        `\n  Run ${chalk.bold('serverless info')} in the project directory after deployment`,
        '    View your endpoints and services',
        '\n  Open Serverless Dashboard after deployment',
        '    Invoke your functions and view logs in the dashboard\n\n',
      ].join('\n')
    );
    return;
  }

  if (hasBeenDeployed) {
    process.stdout.write(
      [
        `\n${chalk.green('Your project is live')}${projectInformationSuffix}`,
        `\n  Run ${chalk.bold('serverless info')} in the project directory`,
        '    View your endpoints and services',
        `\n  Run ${chalk.bold('serverless deploy')} in the directory`,
        "    Redeploy your service after you've updated your service code or configuration",
        `\n  Run ${chalk.bold('serverless invoke')} and ${chalk.bold(
          'serverless logs'
        )} in the project directory`,
        '    Invoke your functions directly and view the logs',
        `\n  Run ${chalk.bold('serverless')} in the project directory`,
        '    Add metrics, alerts, and a log explorer, by enabling the dashboard functionality\n\n',
      ].join('\n')
    );
    return;
  }

  process.stdout.write(
    [
      `\n${chalk.green('Your project is ready for deployment')}${projectInformationSuffix}`,
      `\n  Run ${chalk.bold('serverless deploy')} in the project directory`,
      '    Deploy your newly created service',
      `\n  Run ${chalk.bold('serverless info')} in the project directory after deployment`,
      '    View your endpoints and services',
      `\n  Run ${chalk.bold('serverless invoke')} and ${chalk.bold(
        'serverless logs'
      )} in the project directory after deployment`,
      '    Invoke your functions directly and view the logs',
      `\n  Run ${chalk.bold('serverless')} in the project directory`,
      '    Add metrics, alerts, and a log explorer, by enabling the dashboard functionality\n\n',
    ].join('\n')
  );
};

const configurePlugin = (serverless, originalStdWrite) => {
  serverless.pluginManager.addPlugin(require('./deploy-progress-plugin'));
  const interactivePlugin = serverless.pluginManager.plugins.find(
    (plugin) => plugin.constructor.name === 'InteractiveDeployProgress'
  );
  interactivePlugin.progress._writeOriginalStdout = (data) => originalStdWrite(data);
  return interactivePlugin;
};

module.exports = {
  async isApplicable(context) {
    const { configuration, serviceDir, options } = context;
    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      context.inapplicabilityReasonCode = 'NON_AWS_PROVIDER';
      return false;
    }

    // We want to proceed if the service instance has a linked provider
    if (
      configuration.org &&
      isAuthenticated() &&
      (await doesServiceInstanceHaveLinkedProvider({ configuration, options }))
    ) {
      return true;
    }

    // We want to proceed if local credentials are available
    if (new AWS.Config().credentials) return true;

    context.inapplicabilityReasonCode = 'NO_CREDENTIALS_CONFIGURED';
    return false;
  },
  async run({ initial, configuration, configurationFilename, serviceDir, stepHistory }) {
    const serviceName = configuration.service;
    const shouldDeploy = await promptWithHistory({
      name: 'shouldDeploy',
      message: 'Do you want to deploy your project?',
      stepHistory,
      type: 'confirm',
    });
    if (!shouldDeploy) {
      printMessage({
        initialContext: initial,
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
          // This is a hack to disable local fallback for interactive setup
          // After https://github.com/serverless/serverless/issues/1720 is addressed
          // We can change the approach to deployment in interactive setup and remove this hack
          serverless.isLocallyInstalled = true;
          await serverless.init();
          interactiveOutputPlugin = configurePlugin(serverless, originalStdWrite);
          // Remove previously set `isLocallyInstalled` as it was only needed to avoid local fallback in `init()`
          delete serverless.isLocallyInstalled;
          await serverless.run();
        }
      );
    } catch (err) {
      if (interactiveOutputPlugin) {
        interactiveOutputPlugin.handleError();
      }
      throw err;
    }

    printMessage({
      initialContext: initial,
      serviceName,
      hasBeenDeployed: true,
      isConfiguredWithDashboard: Boolean(configuration.org),
      dashboardPlugin: serverless.pluginManager.dashboardPlugin,
    });
  },
  configuredQuestions: ['shouldDeploy'],
};
