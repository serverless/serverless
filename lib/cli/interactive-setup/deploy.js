'use strict';

const Serverless = require('../../serverless');
const { writeText, style, log } = require('@serverless/utils/log');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { doesServiceInstanceHaveLinkedProvider } = require('./utils');
const _ = require('lodash');
const AWS = require('../../aws/sdk-v2');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');

const printMessage = () => {
  writeText(
    null,
    style.aside('What next?'),
    null,
    '1. Deploy your service',
    null,
    '    serverless deploy',
    null,
    '2. Run Dev Mode to tail logs in real-time',
    null,
    '    serverless dev',
    null,
    '3. Invoke your functions',
    null,
    '    serverless invoke --function function1 --data \'{"message": "Hello"}\'',
    null,
    '4. Learn about other commands, like ...',
    null,
    `serverless invoke    ${style.aside('Invoke deployed functions')}`,
    `serverless --help    ${style.aside('Discover more commands')}`,
    null
  );
};

module.exports = {
  async isApplicable(context) {
    const { isConsole, isOnboarding, configuration, serviceDir, options, initial } = context;

    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if ((isConsole || !isOnboarding) && initial.isInServiceContext) {
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
