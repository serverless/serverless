'use strict';

const { writeText, style } = require('@serverless/utils/log');
const WebSocket = require('ws');
const chalk = require('chalk');
const { devModeFeed } = require('@serverless/utils/lib/auth/urls');
const consoleUi = require('@serverless/utils/console-ui');
const streamBuffers = require('stream-buffers');
const apiRequest = require('@serverless/utils/api-request');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');

const streamBuff = new streamBuffers.ReadableStreamBuffer({
  frequency: 500,
  chunkSize: 2048 * 1000000,
});

const consoleMonitoringCounter = {
  logBatches: 0,
  events: 0,
  responses: 0,
};

const handleSocketMessage = (data) => {
  try {
    const splitData = data.toString('utf-8').split(';;;');
    const jsonArray = splitData
      .filter((item) => item !== '' && item.startsWith('['))
      .flatMap((item) => JSON.parse(item));
    const sortedItems = consoleUi.omitAndSortDevModeActivity(jsonArray);

    for (const activity of sortedItems) {
      const resourceName = ((activity.tags || {}).aws || {}).resourceName;
      const time = consoleUi.formatConsoleDate(new Date(activity.timestamp));

      switch (activity.type) {
        case 'log':
          consoleMonitoringCounter.logBatches += 1;
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Log\n`));
          try {
            const parsedBody = JSON.parse(activity.body);
            if (typeof parsedBody === 'string') {
              throw new Error('Not a JSON object');
            }
            process.stdout.write(chalk.bold(`${JSON.stringify(parsedBody, null, 2)}\n`));
          } catch (error) {
            process.stdout.write(chalk.bold(`${activity.body}\n`));
          }
          break;
        case 'span': {
          const span = consoleUi.formatConsoleSpan(activity);
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Span • ${span.niceName}\n`));
          break;
        }
        case 'aws-lambda-request':
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Invocation Started\n`));
          break;
        case 'aws-lambda-response':
          consoleMonitoringCounter.responses += 1;
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Invocation Ended\n`));
          break;
        case 'event': {
          consoleMonitoringCounter.events += 1;
          const { message, payload } = consoleUi.formatConsoleEvent(activity);
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • ${message}\n`));
          process.stdout.write(chalk.bold(`${JSON.stringify(payload, null, 2)}\n`));
          break;
        }
        default:
      }
    }
  } catch (error) {
    process.stdout.write(error, '\n');
  }
};

const connectToWebSocket = async (functionName, org, state) => {
  const { token } = await apiRequest(`/api/identity/orgs/${org.orgId}/token`);
  const ws = new WebSocket(`${devModeFeed}?Auth=${token}`, {
    perMessageDeflate: false,
  });

  ws.on('open', () => {
    if (state && state === 'firstConnection') {
      writeText(style.aside('Waiting for dev mode activity...\n'));
    } else if (state && state === 'resume') {
      writeText(style.aside('Resuming for dev mode activity...\n'));
    }
    ws.send(JSON.stringify({ filters: { functionName } }));
  });
  ws.on('message', (data) => {
    streamBuff.put(`${data.toString('utf-8')};;;`);
  });
  return ws;
};

const startDevModeFeed = async (context, devModeFeedConnection) =>
  new Promise((resolve) => {
    const createStillWorkingTimeout = () =>
      setTimeout(async () => {
        clearInterval(eventPublishTimer);
        clearInterval(connectionRefreshTimer);
        devModeFeedConnection.terminate();
        writeText(style.aside('Pausing for dev mode activity.\n'));
        const shouldContinue = await promptWithHistory({
          name: 'shouldContinue',
          message: 'Are you still working?',
          stepHistory: context.stepHistory,
          type: 'confirm',
        });

        if (shouldContinue) {
          await startDevModeFeed(context, 'resume');
        }
        resolve();
      }, 1000 * 60 * 60 * 1.5); // Check for activity every 1.5 hours

    let stillWorkingTimer = createStillWorkingTimeout();
    const watchStream = (feed) => {
      feed.on('message', (data) => {
        // Ignore connection message
        const parsedData = JSON.parse(data.toString('utf-8'));
        if (!parsedData.resetThrottle) {
          clearTimeout(stillWorkingTimer);
          stillWorkingTimer = createStillWorkingTimeout();
        }
      });
    };
    watchStream(devModeFeedConnection);

    const connectionRefreshTimer = setInterval(async () => {
      const newConnection = await connectToWebSocket(context.targetFunctions, context.org, false);
      const oldConnection = devModeFeedConnection;
      oldConnection.terminate();
      devModeFeedConnection = newConnection;
      watchStream(devModeFeedConnection);
    }, 1000 * 60 * 60); // Refresh every hour

    const eventPublishTimer = setInterval(async () => {
      const { userId } = await apiRequest('/api/identity/me');
      const body = {
        source: 'web.dev_mode.activity.v1',
        event: {
          orgUid: context.org.orgId,
          userId,
          logBatches: consoleMonitoringCounter.logBatches,
          responses: consoleMonitoringCounter.responses,
          events: consoleMonitoringCounter.events,
          source: 'cli:serverless',
        },
      };
      await apiRequest('/api/events/publish', {
        method: 'POST',
        body,
      });
      consoleMonitoringCounter.logBatches = 0;
      consoleMonitoringCounter.responses = 0;
      consoleMonitoringCounter.events = 0;
    }, 1000 * 60); // Publish every 60 seconds
  });

module.exports = {
  async isApplicable(context) {
    const { isConsoleDevMode, org } = context;

    if (!isConsoleDevMode) {
      context.inapplicabilityReasonCode = 'NON_DEV_MODE_CONTEXT';
      return false;
    }

    if (!org) {
      context.inapplicabilityReasonCode = 'UNRESOLVED_ORG';
      return false;
    }

    return true;
  },

  async run(context) {
    streamBuff.on('data', handleSocketMessage);
    const devModeFeedConnection = await connectToWebSocket(
      context.targetFunctions,
      context.org,
      'firstConnection'
    );
    await startDevModeFeed(context, devModeFeedConnection);
  },
};
