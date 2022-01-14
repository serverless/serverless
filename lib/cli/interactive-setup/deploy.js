'use strict';

const Serverless = require('../../Serverless');
const chalk = require('chalk');
const { legacy, writeText, style } = require('@serverless/utils/log');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { doesServiceInstanceHaveLinkedProvider } = require('./utils');
const _ = require('lodash');
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
  writeText(
    null,
    style.aside('What next?'),
    'Run these commands in the project directory:',
    null,
    `serverless deploy    ${style.aside('Deploy changes')}`,
    `serverless info      ${style.aside('View deployed endpoints and resources')}`,
    `serverless invoke    ${style.aside('Invoke deployed functions')}`,
    `serverless --help    ${style.aside('Discover more commands')}`
  );

  const projectInformationSuffix = initialContext.isInServiceContext
    ? ''
    : `${chalk.green(' and available in ')}${chalk.white.bold(`./${serviceName}`)}`;

  if (isConfiguredWithDashboard) {
    if (hasBeenDeployed) {
      legacy.write(
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

    legacy.write(
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
    legacy.write(
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

  legacy.write(
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
  async run(context) {
    const { initial, configuration, configurationFilename, serviceDir, stepHistory } = context;
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
      commands: ['deploy'],
      options: {},
    });

    await serverless.init();
    await serverless.run();
    context.serverless = serverless;

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
