'use strict';

const { expect } = require('chai');
const awsRequest = require('@serverless/test/aws-request');
const LambdaService = require('aws-sdk').Lambda;
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
          arch: {
            handler: 'basic.handler',
            architecture: 'arm64',
          },
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

  it('should invoke destination target on async invocation', async () => {
    const events = await confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-target`,
      async () => {
        await awsRequest(LambdaService, 'invoke', {
          FunctionName: `${stackName}-trigger`,
          InvocationType: 'Event',
        });
      },
      { checkIsComplete: (soFarEvents) => soFarEvents.length }
    );
    expect(events.length > 0).to.equal(true);
  });

  it('should run lambda in `arm64` architecture', async () => {
    const events = await confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-arch`,
      async () => {
        await awsRequest(LambdaService, 'invoke', {
          FunctionName: `${stackName}-arch`,
          InvocationType: 'Event',
        });
      },
      { checkIsComplete: (soFarEvents) => soFarEvents.length }
    );
    expect(events.length > 0).to.equal(true);
  });
});
