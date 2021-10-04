'use strict';

const { expect } = require('chai');
const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../../fixtures/programmatic');
const { confirmCloudWatchLogs } = require('../../utils/misc');

const { deployService, removeService } = require('../../utils/integration');

describe('test/integration/aws/function.test.js', function () {
  this.timeout(1000 * 60 * 20); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('function', {
      configExt: {
        functions: {
          target: {
            handler: 'target.handler',
          },
          trigger: {
            handler: 'trigger.handler',
            destinations: { onSuccess: 'target' },
          },
        },
      },
    });
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(serviceDir);
  });

  after(async () => {
    if (!serviceDir) return;
    await removeService(serviceDir);
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
      { checkIsComplete: (events) => events.length }
    ).then((events) => {
      expect(events.length > 0).to.equal(true);
    }));
});
