'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const { publishIotData } = require('../../utils/iot');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - IoT Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let iotTopic;
  let tmpDirPath;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique topics (to avoid collision among concurrent CI runs)
        config => {
          iotTopic = `${config.service}/test`;
          config.functions.iotBasic.events[0].iot.sql = `SELECT * FROM '${iotTopic}'`;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    return deployService(tmpDirPath);
  });

  after(() => {
    // Topics are ephemeral and IoT endpoint is part of the account
    console.info('Removing service...');
    return removeService(tmpDirPath);
  });

  describe('Basic Setup', () => {
    it('should invoke on a topic message matching the rule', () => {
      const functionName = 'iotBasic';
      const markers = getMarkers(functionName);
      const message = JSON.stringify({ message: 'Hello from IoT!' });

      // NOTE: This test may fail on fresh accounts where the IoT endpoint has not completed provisioning
      return publishIotData(iotTopic, message)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(message);
        });
    });
  });
});
