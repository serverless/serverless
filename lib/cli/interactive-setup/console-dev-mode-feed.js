'use strict';

const { writeText, style } = require('@serverless/utils/log');
const ms = require('ms');
const WebSocket = require('ws');
const chalk = require('chalk');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const streamBuffers = require('stream-buffers');
const apiRequest = require('@serverless/utils/api-request');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');

const stage = process.env.SERVERLESS_PLATFORM_STAGE || 'prod';
const socketUrl =
  stage === 'prod'
    ? 'wss://socket.core.serverless.com'
    : 'wss://dev.socket.core.serverless-dev.com';

const streamBuff = new streamBuffers.ReadableStreamBuffer({
  frequency: 500,
  chunkSize: 2048 * 1000000,
});

/**
 * getDuration - returns the difference in milliseconds between two ISO strings
 *
 * @param {string} startTime An ISO string
 * @param {string} endTime An ISO string
 * @returns difference in milliseconds
 */
const getDuration = (startTime, endTime) => {
  return new Date(endTime).getTime() - new Date(startTime).getTime();
};

const formatAWSSDKName = ({ activity }) => {
  const { name } = activity;
  const [, , service, operation] = name.split('.');
  let finalName = `AWS SDK • ${service.toUpperCase()} • ${operation.toUpperCase()}`;
  if (name.includes('aws.sdk.dynamodb')) {
    finalName = `AWS SDK • DynamoDB • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.eventbridge')) {
    finalName = `AWS SDK • Event Bridge • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.secretsmanager')) {
    finalName = `AWS SDK • Secrets Manager • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.kinesis')) {
    finalName = `AWS SDK • Kinesis • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.elastictranscoder')) {
    finalName = `AWS SDK • Elastic Transcoder • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.iotdata')) {
    finalName = `AWS SDK • IOT Data • ${operation.toUpperCase()}`;
  } else if (name.includes('aws.sdk.kinesisvideo')) {
    finalName = `AWS SDK • Kinesis Video • ${operation.toUpperCase()}`;
  }
  return {
    name: `${activity.durationFormatted ? `${activity.durationFormatted} • ` : ''}${finalName}`,
  };
};

const formatHTTPName = ({ activity }) => {
  let name = activity.durationFormatted ? `${activity.durationFormatted} • ` : '';
  name += 'HTTP';
  if (activity && activity.tags && activity.tags.http && activity.tags.http.method) {
    name += ` • ${activity.tags.http.method}`;
  }
  if (activity && activity.tags && activity.tags.http && activity.tags.http.path) {
    name += ` • ${activity.tags.http.path}`;
  }

  return {
    name,
  };
};

const formatEvent = (activity = {}) => {
  let message = 'Captured Event';
  let payload = {};
  let customTags = {};
  try {
    const parsedTags = JSON.parse(activity.customTags);
    customTags = Object.keys(parsedTags).length > 0 ? { customTags: parsedTags } : {};
  } catch {
    // ignore
  }
  if (activity.eventName === 'telemetry.error.generated.v1') {
    payload = {
      ...activity.tags.error,
      ...customTags,
    };
    switch (activity.tags.error.type) {
      case 'ERROR_TYPE_CAUGHT_USER':
      case 'ERROR_TYPE_CAUGHT_SDK_INTERNAL':
      case 'ERROR_TYPE_CAUGHT_SDK_USER': {
        message = 'ERROR • Handled';
        break;
      }
      case 'ERROR_TYPE_UNCAUGHT': {
        message = 'ERROR • Unhandled';
        break;
      }
      case 'ERROR_TYPE_UNSPECIFIED':
      default: {
        message = 'ERROR • Unspecified';
      }
    }
  } else if (activity.eventName === 'telemetry.warning.generated.v1') {
    message = `WARNING • ${activity.tags.warning.message}`;
    payload = { ...activity.tags.warning, ...customTags };
  }

  return {
    message,
    payload,
  };
};

const formatSpan = (data = {}) => {
  // Add nice names for the span types
  if (data.startTime && data.endTime && !data.duration) {
    data.duration = getDuration(data.startTime, data.endTime);
    data.durationFormatted = data.duration ? ms(data.duration) : null;
  }
  const name = data.name;
  if (/aws\.sdk/.test(name)) {
    const { name: niceName } = formatAWSSDKName({ activity: data });
    data.niceName = niceName;
  } else if (name && (name.includes('node.http.request') || name.includes('node.https.request'))) {
    const { name: niceName } = formatHTTPName({ activity: data });
    data.niceName = niceName;
  } else {
    data.niceName = data.name;
  }
  return data;
};

const formatDate = (date) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  return `${hours}:${minutes}:${seconds}:${milliseconds}`;
};

const omitAndSort = (array) => {
  return array
    .filter((data) => {
      /**
       * Don't include the following
       * - No timestamp
       * - Not a valid object type
       * - Not a aws.sdk or http span
       * - message is a string (This would be a filter message from the log socket service)
       */
      if (!data.timestamp || data.timestamp === '') {
        return false;
      } else if (
        !['span', 'log', 'aws-lambda-request', 'aws-lambda-response', 'event'].includes(data.type)
      ) {
        return false;
      } else if (data.type === 'span') {
        if (
          !data.name.startsWith('aws.sdk') &&
          !data.name.startsWith('node.http.request') &&
          !data.name.startsWith('node.https.request')
        ) {
          return false;
        }
      } else if (typeof data.message === 'string') {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // If times are the same we should fall back to the sequenceId
      if (
        new Date(b.timestamp).getTime() === new Date(a.timestamp || 0).getTime() &&
        a.type === 'log' &&
        b.type === 'log' &&
        a.tags &&
        b.tags &&
        a.tags.aws &&
        b.tags.aws
      ) {
        return a.tags.aws.sequenceId - b.tags.aws.sequenceId;
      } else if (new Date(b.timestamp).getTime() === new Date(a.timestamp || 0).getTime()) {
        return a.sequenceId - b.sequenceId;
      }
      return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
    });
};

const handleSocketMessage = (data) => {
  try {
    const splitData = data.toString('utf-8').split(';;;');
    const jsonArray = splitData.reduce((arr, item) => {
      try {
        const parsedItem = JSON.parse(item);
        if (Array.isArray(parsedItem)) {
          return [...arr, ...parsedItem];
        }
        throw new Error('Not an array');
      } catch (error) {
        return arr;
      }
    }, []);
    if (!Array.isArray(jsonArray)) return;
    const sortedItems = omitAndSort(jsonArray);

    for (const activity of sortedItems) {
      const resourceName = ((activity.tags || {}).aws || {}).resourceName;
      const time = formatDate(new Date(activity.timestamp), 'HH:mm:ss.SSS');

      switch (activity.type) {
        case 'log':
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
          const span = formatSpan(activity);
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Span • ${span.niceName}\n`));
          break;
        }
        case 'aws-lambda-request':
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Invocation Started\n`));
          break;
        case 'aws-lambda-response':
          process.stdout.write(chalk.grey(`${time} • ${resourceName} • Invocation Ended\n`));
          break;
        case 'event': {
          const { message, payload } = formatEvent(activity);
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
  const ws = new WebSocket(`${socketUrl}?Auth=${token}`, {
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

const startDevModeFeed = async (context, devModeFeed) =>
  new Promise((resolve) => {
    const createStillWorkingTimeout = () =>
      setTimeout(async () => {
        clearInterval(connectionRefreshTimer);
        devModeFeed.terminate();
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
    watchStream(devModeFeed);

    const connectionRefreshTimer = setInterval(async () => {
      const newConnection = await connectToWebSocket(context.targetFunctions, context.org, false);
      const oldConnection = devModeFeed;
      oldConnection.terminate();
      devModeFeed = newConnection;
      watchStream(devModeFeed);
    }, 1000 * 60 * 60); // Refresh every hour minutes
  });

module.exports = {
  async isApplicable(context) {
    const { isConsole, launchDev } = context;

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (!launchDev) {
      context.inapplicabilityReasonCode = 'NON_LAUNCH_DEV_CONTEXT';
      return false;
    }

    if (!context.serverless) {
      context.inapplicabilityReasonCode = 'NO_SERVERLESS_CONTEXT';
      return false;
    }

    if (!(await resolveAuthMode())) {
      context.inapplicabilityReasonCode = 'NOT_LOGGED_IN';
      return false;
    }

    if (!context.org) {
      context.inapplicabilityReasonCode = 'UNRESOLVED_ORG';
      return false;
    }

    return true;
  },

  async run(context) {
    streamBuff.on('data', handleSocketMessage);
    const devModeFeed = await connectToWebSocket(
      context.targetFunctions,
      context.org,
      'firstConnection'
    );
    await startDevModeFeed(context, devModeFeed);
  },
  configuredQuestions: ['shouldSetupConsoleIamRole'],
};
