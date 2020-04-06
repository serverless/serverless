'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../../fixtures');
const { confirmCloudWatchLogs } = require('../../utils/misc');

const { getTmpDirPath } = require('../../utils/fs');
const { createTestService, deployService, removeService } = require('../../utils/integration');

describe('Function destinations Integration Test', function() {
  this.timeout(1000 * 60 * 20); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    log.debug('temporary path %s', tmpDirPath);

    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: fixtures.map.functionDestinations,
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    log.notice('deploying %s service', serviceName);
    await deployService(tmpDirPath);
  });

  after(async () => {
    if (!serviceName) return;
    log.notice('Removing service...');
    await removeService(tmpDirPath);
  });

  it('on async invoke should invoke destination target', async () =>
    confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-target`,
      async () => {
        await awsRequest('Lambda', 'invoke', {
          FunctionName: `${stackName}-trigger`,
          InvocationType: 'Event',
        });
      },
      { checkIsComplete: events => events.length }
    ).then(events => {
      expect(events.length > 0).to.equal(true);
    }));
});
