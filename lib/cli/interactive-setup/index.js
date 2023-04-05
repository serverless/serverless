'use strict';

const apiRequest = require('@serverless/utils/api-request');
const inquirer = require('@serverless/utils/inquirer');
const ServerlessError = require('@serverless/utils/serverless-error');
const { StepHistory } = require('@serverless/utils/telemetry');
const log = require('@serverless/utils/log').log.get('onboarding');
const { resolveInitialContext } = require('./utils');
const { awsRequest } = require('./utils');

const steps = {
  service: require('./service'),
  consoleLogin: require('./console-login'),
  dashboardLogin: require('./dashboard-login'),
  consoleResolveOrg: require('./console-resolve-org'),
  consoleSetupIamRole: require('./console-setup-iam-role'),
  dashboardSetOrg: require('./dashboard-set-org'),
  awsCredentials: require('./aws-credentials'),
  deploy: require('./deploy'),
  consoleEnableDevMode: require('./console-enable-dev-mode'),
  consoleDevModeFeed: require('./console-dev-mode-feed'),
};

const resolveAwsAccountId = async (context) => {
  try {
    return (await awsRequest(context, 'STS', 'getCallerIdentity')).Account;
  } catch {
    return null;
  }
};

module.exports = async (context) => {
  const stepsDetails = new Map(
    Object.entries(steps).map(([stepName, step]) => {
      return [stepName, { configuredQuestions: step.configuredQuestions }];
    })
  );
  const { commandUsage, options } = context;
  const history = new Map();
  context = { ...context, inquirer, history };

  commandUsage.stepsHistory = history;
  commandUsage.stepsHistory.toJSON = () => {
    return Array.from(stepsDetails.entries()).map(([step, stepDetails]) => {
      const stepHistory = history.get(step);
      return {
        name: step,
        ...stepDetails,
        history: stepHistory ? stepHistory.toJSON() : [],
      };
    });
  };

  const initialContext = resolveInitialContext(context);
  commandUsage.initialContext = initialContext;
  context.initial = initialContext;
  context.awsAccountId = await resolveAwsAccountId(context);
  context.isOnboarding = !options.dev;
  context.isDashboard = !options.console && !options.dev;
  if (options.console || (options.dev && initialContext.isInServiceContext)) {
    if (!context.awsAccountId) {
      log.error(
        'We’re unable to connect Console via the CLI - No local AWS credentials found\n' +
          'Visit https://console.serverless.com/ to set up Console from the web'
      );
    } else {
      context.isConsole = true;
    }
  }

  if (context.isConsole && options.dev && initialContext.isInServiceContext) {
    const compatibilityMap = await apiRequest('/api/inventories/compatibility', {
      method: 'GET',
      noAuth: true,
    });
    const devModeRuntimeCompatibility = compatibilityMap.mode.dev.runtimes;
    const { provider } = context.serverless.service;
    if (!devModeRuntimeCompatibility.includes(provider.runtime)) {
      log.error('This services runtime is not currently supported by Serverless Console Dev Mode.');
      context.isConsole = false;
    } else {
      context.isConsoleDevMode = true;
    }
  } else if (options.dev && !initialContext.isInServiceContext) {
    throw new ServerlessError(
      'Cannot launch dev mode when not in a service context.',
      'NOT_APPLICABLE_DEV_MODE_CONTEXT'
    );
  }

  for (const [stepName, step] of Object.entries(steps)) {
    delete context.stepHistory;
    delete context.inapplicabilityReasonCode;
    const stepData = await step.isApplicable(context);
    if (stepData) log.debug('%s: applicable: %o', stepName, stepData);
    else log.debug('%s: not applicable: %s', stepName, context.inapplicabilityReasonCode);
    Object.assign(stepsDetails.get(stepName), {
      isApplicable: Boolean(stepData),
      inapplicabilityReasonCode: context.inapplicabilityReasonCode,
      timestamp: Date.now(),
    });
    if (stepData) {
      log.notice();
      context.stepHistory = new StepHistory();
      context.history.set(stepName, context.stepHistory);
      await step.run(context, stepData);
    }
  }

  return context;
};
