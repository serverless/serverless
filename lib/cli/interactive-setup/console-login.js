'use strict';

const _ = require('lodash');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const login = require('../../commands/login/console');
const { showOnboardingWelcome } = require('./utils');

const loginOrRegisterQuestion = async (context) => {
  let message;
  if (context.initial.isInServiceContext) {
    message = 'Press [Enter] to create a free Serverless Console account';
  } else {
    message = 'Do you want to login/register to Serverless Console?';
  }
  return promptWithHistory({
    message,
    type: 'confirm',
    name: 'shouldLoginOrRegister',
    stepHistory: context.stepHistory,
  });
};

const steps = {
  loginOrRegister: async (context) => {
    const shouldLoginOrRegister =
      context.options.org || context.configuration.org || (await loginOrRegisterQuestion(context));
    if (shouldLoginOrRegister) await login({ clientOriginCommand: 'onboarding' });
  },
};

module.exports = {
  async isApplicable(context) {
    const { isConsole, configuration, serviceDir } = context;

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (await resolveAuthMode()) {
      context.inapplicabilityReasonCode = 'ALREADY_LOGGED_IN';
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      context.inapplicabilityReasonCode = 'NON_AWS_PROVIDER';
      return false;
    }

    const runtime = _.get(configuration.provider, 'runtime') || 'nodejs14.x';
    if (!runtime.startsWith('nodejs')) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_RUNTIME';
      return false;
    }
    return true;
  },
  async run(context) {
    const isOrgProvided = context.options.org || context.configuration.org;

    if (context.initial.isInServiceContext && !context.initial.isConsoleEnabled && !isOrgProvided) {
      showOnboardingWelcome(context);
    }

    return steps.loginOrRegister(context);
  },
  steps,
  configuredQuestions: ['shouldLoginOrRegister'],
};
