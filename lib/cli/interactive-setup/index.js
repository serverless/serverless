'use strict';

const inquirer = require('@serverless/utils/inquirer');

const steps = {
  service: require('./service'),
  dashboardLogin: require('@serverless/dashboard-plugin/lib/cli/interactive-setup/dashboard-login'),
  dashboardSetOrg: require('@serverless/dashboard-plugin/lib/cli/interactive-setup/dashboard-set-org'),
  awsCredentials: require('./aws-credentials'),
};

module.exports = async (context) => {
  context = { ...context, inquirer, history: new Map() };
  for (const [stepName, step] of Object.entries(steps)) {
    delete context.stepHistory;
    const stepData = await step.isApplicable(context);
    if (stepData) {
      process.stdout.write('\n');
      context.stepHistory = [];
      context.history.set(stepName, context.stepHistory);
      await step.run(context, stepData);
    }
  }
};
