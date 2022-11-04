'use strict';

const Serverless = require('../../serverless');
const { writeText, style, log } = require('@serverless/utils/log');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { doesServiceInstanceHaveLinkedProvider } = require('./utils');
const _ = require('lodash');
const AWS = require('aws-sdk');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');

const printMessage = () => {
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
};

module.exports = {
  async isApplicable(context) {
    const { configuration, serviceDir, options, initial } = context;
    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (options.console && initial.isInServiceContext) {
      context.inapplicabilityReasonCode = 'CONSOLE_INTEGRATION';
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
      configuration.app &&
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
    const { configuration, configurationFilename, serviceDir, stepHistory, history } = context;
    if (configuration.org && !history.has('dashboardSetOrg')) {
      log.notice(
        'Your service is configured with Serverless Dashboard and is ready to be deployed.'
      );
      log.notice();
    }

    const shouldDeploy = await promptWithHistory({
      name: 'shouldDeploy',
      message: 'Do you want to deploy now?',
      stepHistory,
      type: 'confirm',
    });
    if (!shouldDeploy) {
      printMessage();
      return;
    }

    const serverless = new Serverless({
      configuration,
      serviceDir,
      configurationFilename,
      commands: ['deploy'],
      options: {},
    });

    await serverless.init();
    await serverless.run();
    context.serverless = serverless;

    printMessage();
  },
  configuredQuestions: ['shouldDeploy'],
};
