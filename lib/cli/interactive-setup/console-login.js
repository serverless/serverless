'use strict';

const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const login = require('../../commands/login/console');
const { showOnboardingWelcome } = require('./utils');

const loginOrRegisterQuestion = async (context) => {
  return promptWithHistory({
    message: 'Press [Enter] to login to Serverless Console.',
    type: 'confirm',
    name: 'shouldLoginOrRegister',
    stepHistory: context.stepHistory,
  });
};

const steps = {
  loginOrRegister: async (context) => {
    const shouldLoginOrRegister = await loginOrRegisterQuestion(context);
    if (shouldLoginOrRegister) await login({ clientOriginCommand: 'onboarding' });
  },
};

module.exports = {
  async isApplicable(context) {
    const { isConsole } = context;

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (await resolveAuthMode()) {
      context.inapplicabilityReasonCode = 'ALREADY_LOGGED_IN';
      return false;
    }

    return true;
  },
  async run(context) {
    showOnboardingWelcome(context);

    return steps.loginOrRegister(context);
  },
  steps,
  configuredQuestions: ['shouldLoginOrRegister'],
};
