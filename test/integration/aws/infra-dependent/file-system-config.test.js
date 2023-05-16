'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../../fixtures/programmatic');

const awsRequest = require('@serverless/test/aws-request');
const LambdaService = require('aws-sdk').Lambda;
const crypto = require('crypto');
const { deployService, removeService } = require('../../../utils/integration');
const {
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
} = require('../../../utils/cloudformation');

const EFS_MAX_PROPAGATION_TIME = 1000 * 60 * 5;

const retryableMountErrors = new Set([
  'EFSMountFailureException',
  'EFSMountTimeoutException',
  'EFSIOException',
]);

describe('AWS - FileSystemConfig Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let startTime;
  let serviceDir;
  const stage = 'dev';
  const filename = `/mnt/testing/${crypto.randomBytes(8).toString('hex')}.txt`;

  before(async () => {
    const isDepsStackAvailable = await isDependencyStackAvailable();
    if (!isDepsStackAvailable) {
      throw new Error('CloudFormation stack with integration test dependencies not found.');
    }

    const outputMap = await getDependencyStackOutputMap();

    const fileSystemConfig = {
      localMountPath: '/mnt/testing',
      arn: outputMap.get('EFSAccessPointARN'),
    };

    const serviceData = await fixtures.setup('function-efs', {
      configExt: {
        provider: {
          vpc: {
            subnetIds: [outputMap.get('PrivateSubnetA')],
            securityGroupIds: [outputMap.get('SecurityGroup')],
          },
          environment: {
            FILENAME: filename,
          },
        },
        functions: { writer: { fileSystemConfig }, reader: { fileSystemConfig } },
      },
    });
    ({ servicePath: serviceDir } = serviceData);

    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(serviceDir);
    startTime = Date.now();
  });

  after(async () => {
    if (serviceDir) {
      await removeService(serviceDir);
    }
  });

  it('should be able to write to efs and read from it in a separate function', async function self() {
    try {
      await awsRequest(LambdaService, 'invoke', {
        FunctionName: `${stackName}-writer`,
        InvocationType: 'RequestResponse',
      });
    } catch (e) {
      // Sometimes EFS is not available right away which causes invoke to fail,
      // here we retry it to avoid that issue
      if (retryableMountErrors.has(e.code) && Date.now() - startTime < EFS_MAX_PROPAGATION_TIME) {
        log.warn('Failed to invoke, retry');
        return self();
      }
      throw e;
    }

    const readerResult = await awsRequest(LambdaService, 'invoke', {
      FunctionName: `${stackName}-reader`,
      InvocationType: 'RequestResponse',
    });
    const payload = JSON.parse(readerResult.Payload);

    expect(payload).to.deep.equal({ result: 'fromlambda' });
    return null;
  });
});
