'use strict';

const _ = require('lodash');
const { ServerlessSDK } = require('@serverless/platform-client');
const login = require('@serverless/dashboard-plugin/lib/login');
const configUtils = require('@serverless/utils/config');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { showOnboardingWelcome } = require('./utils');

const loginOrRegisterQuestion = async (stepHistory) =>
  promptWithHistory({
    message: 'Do you want to login/register to Serverless Dashboard?',
    type: 'confirm',
    name: 'shouldLoginOrRegister',
    stepHistory,
  });

const steps = {
  loginOrRegister: async (context) => {
    const shouldLoginOrRegister =
      context.options.org ||
      context.configuration.org ||
      (await loginOrRegisterQuestion(context.stepHistory));
    if (shouldLoginOrRegister) {
      await login({ isInteractive: true });
    }
  },
};

module.exports = {
  async isApplicable(context) {
    const { configuration, options, serviceDir } = context;

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

    if (process.env.SERVERLESS_ACCESS_KEY) {
      context.inapplicabilityReasonCode = 'SERVERLESS_ACCESS_KEY_PROVIDED';
      return false;
    }

    const sdk = new ServerlessSDK();
    const { supportedRegions, supportedRuntimes } = await sdk.metadata.get();
    if (!supportedRuntimes.includes(_.get(configuration.provider, 'runtime') || 'nodejs12.x')) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_RUNTIME';
      return false;
    }
    if (
      !supportedRegions.includes(options.region || configuration.provider.region || 'us-east-1')
    ) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_REGION';
      return false;
    }
    const isLoggedIn = Boolean(configUtils.getLoggedInUser());
    if (isLoggedIn) {
      context.inapplicabilityReasonCode = 'ALREADY_LOGGED_IN';
    }
    return !isLoggedIn;
  },
  async run(context) {
    const isOrgProvided = context.options.org || context.configuration.org;

    if (
      context.initial.isInServiceContext &&
      !context.initial.isDashboardEnabled &&
      !isOrgProvided
    ) {
      showOnboardingWelcome(context);
    }

    return steps.loginOrRegister(context);
  },
  steps,
  configuredQuestions: ['shouldLoginOrRegister'],
};
