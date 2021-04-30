'use strict';

const steps = {
  service: require('./service'),
  awsCredentials: require('./aws-credentials'),
  autoUpdate: require('./auto-update'),
  tabCompletion: require('./tab-completion'),
};

module.exports = async (context) => {
  for (const step of Object.values(steps)) {
    if (await step.isApplicable(context)) {
      process.stdout.write('\n');
      await step.run(context);
    }
  }
};
