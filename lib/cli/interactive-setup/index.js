'use strict';

const inquirer = require('@serverless/utils/inquirer');
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

  if (options.console) {
    if (!context.awsAccountId) {
      log.error(
        'We’re unable to connect Console via the CLI - No local AWS credentials found\n' +
          'Visit https://console.serverless.com/ to set up Console from the web'
      );
    } else {
      context.isConsole = true;
    }
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
