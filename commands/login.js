'use strict';

const resolveIsDashboardEnabled = require('../lib/configuration/is-dashboard-enabled');

module.exports = async (context) => {
  const { configuration, options } = context;
  const identityName = await (async () => {
    if (options.console) return 'console';
    if (options.dashboard) return 'dashboard';

    const isDashboardEnabled = resolveIsDashboardEnabled({ configuration, options });

    if (isDashboardEnabled) return 'dashboard';

    const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
    const { StepHistory } = require('@serverless/utils/telemetry');
    context.history = new StepHistory();
    return await promptWithHistory({
      message: 'Which would you like to log into?',
      type: 'list',
      name: 'identityName',
      choices: [
        { name: 'Serverless Framework Dashboard', value: 'dashboard' },
        { name: 'Serverless Console', value: 'console' },
      ],
      stepHistory: context.history,
      recordRawAnswerInHistory: true,
    });
  })();

  switch (identityName) {
    case 'console':
      await require('../lib/commands/login/console')({ clientOriginCommand: 'login' });
      break;
    case 'dashboard':
      await require('../lib/commands/login/dashboard')();
      break;
    default:
      throw new Error(`Unexpected identityName: ${identityName}`);
  }

  return context;
};
