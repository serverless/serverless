'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const { createSqsQueue, deleteSqsQueue, sendSqsMessage } = require('../../utils/sqs');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - SQS Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let queueName;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique queues (to avoid collision among concurrent CI runs)
        config => {
          queueName = `${config.service}-basic`;
          config.functions.sqsBasic.events[0].sqs.arn['Fn::Join'][1][5] = queueName;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create existing SQS queue
    // NOTE: deployment can only be done once the SQS queue is created
    console.info(`Creating SQS queue "${queueName}"...`);
    return createSqsQueue(queueName).then(() => {
      console.info(`Deploying "${stackName}" service...`);
      return deployService(tmpDirPath);
    });
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info('Deleting SQS queue');
    return deleteSqsQueue(queueName);
  });

  describe('Basic Setup', () => {
    it('should invoke on queue message(s)', () => {
      const functionName = 'sqsBasic';
      const markers = getMarkers(functionName);
      const message = 'Hello from SQS!';

      return sendSqsMessage(queueName, message)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include(message);
        });
    });
  });
});
