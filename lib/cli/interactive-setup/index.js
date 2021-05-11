'use strict';

const inquirer = require('@serverless/utils/inquirer');

const steps = {
  service: require('./service'),
  dashboardLogin: require('@serverless/dashboard-plugin/lib/cli/interactive-setup/dashboard-login'),
  dashboardSetOrg: require('@serverless/dashboard-plugin/lib/cli/interactive-setup/dashboard-set-org'),
  awsCredentials: require('./aws-credentials'),
  autoUpdate: require('./auto-update'),
  tabCompletion: require('./tab-completion'),
};

module.exports = async (context) => {
  context = { ...context, inquirer };
  for (const step of Object.values(steps)) {
    const stepData = await step.isApplicable(context);
    if (stepData) {
      process.stdout.write('\n');
      await step.run(context, stepData);
    }
  }
};
