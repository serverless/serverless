'use strict';

const { writeText, style, log, progress } = require('@serverless/utils/log');
const { frontend } = require('@serverless/utils/lib/auth/urls');
const colorize = require('json-colorizer');
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

const jsonError = {
  colors: {
    BRACE: '#FD5750',
    BRACKET: '#FD5750',
    COLON: '#FD5750',
    COMMA: '#FD5750',
    STRING_KEY: '#FD5750',
    STRING_LITERAL: '#FD5750',
    NUMBER_LITERAL: '#FD5750',
    BOOLEAN_LITERAL: '#FD5750',
    NULL_LITERAL: '#FD5750',
  },
};

const jsonColors = {
  colors: {
    BRACE: 'white',
    BRACKET: 'white',
    COLON: 'white.bold',
    COMMA: 'white',
    STRING_KEY: 'white.bold',
    STRING_LITERAL: 'white',
    NUMBER_LITERAL: 'white',
    BOOLEAN_LITERAL: 'white',
    NULL_LITERAL: 'white',
  },
};
const headerChalk = chalk.grey;
const errorTracker = {};

const handleSocketMessage = (context) => (data) => {
  try {
    const verbose = context.options.verbose;
    const splitData = data.toString('utf-8').split(';;;');
    const jsonArray = splitData
      .filter((item) => item !== '' && item.startsWith('['))
      .flatMap((item) => JSON.parse(item));
    const sortedItems = consoleUi.omitAndSortDevModeActivity(jsonArray);

    for (const activity of sortedItems) {
      const resourceName = ((activity.tags || {}).aws || {}).resourceName;
      const time = consoleUi.formatConsoleDate(new Date(activity.timestamp));

      const tryPrintJSON = (str) => {
        try {
          const parsedBody = JSON.parse(str);
          if (typeof parsedBody === 'string') {
            throw new Error('Not a JSON object');
          }
          const colors = activity.severityText === 'ERROR' ? jsonError : jsonColors;
          process.stdout.write(`${colorize(JSON.stringify(parsedBody, null, 2), colors)}\n`);
        } catch (error) {
          process.stdout.write(chalk.white(`${str}${str.endsWith('\n') ? '' : '\n'}`));
        }
      };

      switch (activity.type) {
        case 'log':
          consoleMonitoringCounter.logBatches += 1;
          process.stdout.write(headerChalk(`\n${time} • ${resourceName} • Log\n`));
          tryPrintJSON(activity.body);
          break;
        case 'span': {
          const span = consoleUi.formatConsoleSpan(activity);
          process.stdout.write(
            headerChalk(`\n${time} • ${resourceName} • Span • ${span.niceName}\n`)
          );
          if (verbose) {
            if (activity.input) {
              process.stdout.write(headerChalk('Input\n'));
              tryPrintJSON(activity.input);
            }
            if (activity.output) {
              process.stdout.write(headerChalk('Output\n'));
              tryPrintJSON(activity.output);
            }
          }
          break;
        }
        case 'aws-lambda-request':
          process.stdout.write(headerChalk(`\n${time} • ${resourceName} • Invocation Started\n`));
          if (verbose) {
            tryPrintJSON(activity.body);
          }
          break;
        case 'aws-lambda-response':
          consoleMonitoringCounter.responses += 1;
          process.stdout.write(headerChalk(`\n${time} • ${resourceName} • Invocation Ended\n`));
          if (verbose) {
            tryPrintJSON(activity.body);
          }
          if (errorTracker[activity.traceId]) {
            const uiLink = `${frontend}/${
              context.org.orgName
            }/explorer?explorerSubScope=invocations&explorerTraceId=${encodeURIComponent(
              activity.traceId
            )}&explorerTraceTime${
              errorTracker[activity.traceId]
            }&globalScope=awsLambda&globalTimeFrame=24h`;
            process.stdout.write(chalk.white(`View full trace: ${uiLink}\n`));
            delete errorTracker[activity.traceId];
          }
          break;
        case 'event': {
          consoleMonitoringCounter.events += 1;
          const { message, payload } = consoleUi.formatConsoleEvent(activity);
          const isError = /ERROR •/.test(message);
          const headerWriter = isError ? chalk.hex('#FD5750') : headerChalk;
          const options = isError ? jsonError : jsonColors;
          process.stdout.write(headerWriter(`\n${time} • ${resourceName} • ${message}\n`));
          process.stdout.write(`${colorize(JSON.stringify(payload, null, 2), options)}\n`);
          if (isError) {
            errorTracker[activity.traceId] = activity.timestamp;
          }
          break;
        }
        default:
      }
    }
  } catch (error) {
    process.stdout.write(error, '\n');
  }
};

const connectToWebSocket = async ({ functionName, region, accountId, org, state }) => {
  const { token } = await apiRequest(`/api/identity/orgs/${org.orgId}/token`);
  const ws = new WebSocket(`${devModeFeed}?Auth=${token}`, {
    perMessageDeflate: false,
  });

  ws.on('open', () => {
    if (state && state === 'firstConnection') {
      const functionNameQueryParams = functionName
        .map((name) => `devModeFunctionName=${encodeURIComponent(name)}`)
        .join('&');
      const uiLink = `${frontend}/${org.orgName}/dev-mode?devModeCloudAccountId=${accountId}&${functionNameQueryParams}`;
      writeText(
        style.aside(
          '\n• WARNING: Dev mode will not sample traces. This may increase CloudWatch and Serverless Console costs for higher volume functions.',
          '• Use the `--verbose` flag to see inputs and outputs of all requests (e.g. DynamoDB inputs/outputs).',
          `• Use the Console Dev Mode UI for deeper inspection: ${uiLink}\n`,
          'Waiting for activity... Invoke your functions now.'
        )
      );
    } else if (state && state === 'resume') {
      writeText(style.aside('\nResuming for dev mode activity...'));
    }
    ws.send(
      JSON.stringify({ filters: { functionName, region: [region], accountId: [accountId] } })
    );
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

    const connectionRefreshTimer = setInterval(async () => {
      const newConnection = await connectToWebSocket({
        functionName: context.consoleDevModeTargetFunctions,
        accountId: context.awsAccountId,
        region: context.serverless.service.provider.region,
        org: context.org,
        state: false,
      });
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

    const watchStream = (feed) => {
      feed.on('message', (data) => {
        // Ignore connection message
        const parsedData = JSON.parse(data.toString('utf-8'));
        if (!parsedData.resetThrottle) {
          clearTimeout(stillWorkingTimer);
          stillWorkingTimer = createStillWorkingTimeout();
        }
      });
      feed.on('close', () => {
        // Clean up if we receive a close event
        clearInterval(eventPublishTimer);
        clearInterval(connectionRefreshTimer);
        clearTimeout(stillWorkingTimer);
        resolve();
      });
    };
    watchStream(devModeFeedConnection);
  });

module.exports = {
  async isApplicable(context) {
    const { isConsoleDevMode, org, consoleDevModeTargetFunctions } = context;

    if (!isConsoleDevMode) {
      context.inapplicabilityReasonCode = 'NON_DEV_MODE_CONTEXT';
      return false;
    }

    if (!org) {
      context.inapplicabilityReasonCode = 'UNRESOLVED_ORG';
      return false;
    }

    if (!consoleDevModeTargetFunctions) {
      context.inapplicabilityReasonCode = 'NO_TARGET_FUNCTIONS';
      return false;
    }

    return true;
  },

  async run(context) {
    const devModeProgress = progress.get('dev-mode-progress');
    devModeProgress.remove();
    log.notice.success('Dev Mode Initialized.');
    streamBuff.on('data', handleSocketMessage(context));
    const devModeFeedConnection = await connectToWebSocket({
      functionName: context.consoleDevModeTargetFunctions,
      accountId: context.awsAccountId,
      region: context.serverless.service.provider.region,
      org: context.org,
      state: 'firstConnection',
    });
    await startDevModeFeed(context, devModeFeedConnection);
  },
};
