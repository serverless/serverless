'use strict';

const _ = require('lodash');
const { ServerlessSDK } = require('@serverless/platform-client');
const configUtils = require('@serverless/utils/config');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const log = require('@serverless/utils/log').log.get('onboarding');
const login = require('../../commands/login/dashboard');
const { showOnboardingWelcome } = require('./utils');

const loginOrRegisterQuestion = async ({ stepHistory }) =>
  promptWithHistory({
    message: 'Register or Login to Serverless Framework',
    type: 'confirm',
    name: 'shouldLoginOrRegister',
    stepHistory,
  });

const steps = {
  loginOrRegister: async (context) => {
    const shouldLoginOrRegister =
      context.options.org || context.configuration.org || (await loginOrRegisterQuestion(context));
    if (shouldLoginOrRegister) await login(context.options);
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
    const sdkMetadata = await (async () => {
      try {
        return await sdk.metadata.get();
      } catch (error) {
        log.info("Cannot connect to Serverless Platform. Skipping 'dashboard-login' step", error);
        return null;
      }
    })();
    if (!sdkMetadata) {
      context.inapplicabilityReasonCode = 'SERVER_UNAVAILABLE';
      return false;
    }
    const { supportedRegions, supportedRuntimes } = sdkMetadata;
    if (!supportedRuntimes.includes(_.get(configuration.provider, 'runtime') || 'nodejs14.x')) {
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
