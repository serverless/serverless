'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/misc');
const { getMarkers } = require('../shared/utils');

describe('AWS - Schedule Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  const stage = 'dev';

  before(() => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    deployService(tmpDirPath);
  });

  after(() => {
    console.info('Removing service...');
    removeService(tmpDirPath);
  });

  describe('Minimal Setup', () => {
    it('should invoke every minute', () => {
      const functionName = 'scheduleMinimal';
      const markers = getMarkers(functionName);

      return waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end).then(
        logs => {
          expect(logs).to.include(functionName);
        }
      );
    });
  });

  describe('Extended Setup', () => {
    it('should invoke every minute with transformed input', () => {
      const functionName = 'scheduleExtended';
      const markers = getMarkers(functionName);

      return waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end).then(
        logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include('transformedInput');
        }
      );
    });
  });
});
