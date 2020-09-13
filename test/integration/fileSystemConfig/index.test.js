'use strict';

const path = require('path');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures');

const awsRequest = require('@serverless/test/aws-request');
const fs = require('fs');
const crypto = require('crypto');
const { deployService, removeService } = require('../../utils/integration');

const EFS_MAX_PROPAGATION_TIME = 1000 * 60 * 5;

const retryableMountErrors = new Set([
  'EFSMountFailureException',
  'EFSMountTimeoutException',
  'EFSIOException',
]);

describe('AWS - FileSystemConfig Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let startTime;
  let servicePath;
  const stage = 'dev';
  const resourcesStackName = `efs-integration-tests-deps-stack-${crypto
    .randomBytes(8)
    .toString('hex')}`;

  before(async () => {
    const cfnTemplate = fs.readFileSync(path.join(__dirname, 'cloudformation.yml'), 'utf8');

    log.notice('Deploying CloudFormation stack with required resources...');
    await awsRequest('CloudFormation', 'createStack', {
      StackName: resourcesStackName,
      TemplateBody: cfnTemplate,
    });
    const waitForResult = await awsRequest('CloudFormation', 'waitFor', 'stackCreateComplete', {
      StackName: resourcesStackName,
    });

    const outputMap = waitForResult.Stacks[0].Outputs.reduce((map, output) => {
      map[output.OutputKey] = output.OutputValue;
      return map;
    }, {});

    const fileSystemConfig = {
      localMountPath: '/mnt/testing',
      arn: outputMap.AccessPointARN,
    };
    const serviceData = await fixtures.setup('functionEfs', {
      configExt: {
        provider: {
          vpc: {
            subnetIds: [outputMap.Subnet],
            securityGroupIds: [outputMap.SecurityGroup],
          },
        },
        functions: { writer: { fileSystemConfig }, reader: { fileSystemConfig } },
      },
    });
    ({ servicePath } = serviceData);

    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(servicePath);
    startTime = Date.now();
  });

  after(async () => {
    await removeService(servicePath);
    log.notice('Removing CloudFormation stack with required resources...');
    await awsRequest('CloudFormation', 'deleteStack', { StackName: resourcesStackName });
    return awsRequest('CloudFormation', 'waitFor', 'stackDeleteComplete', {
      StackName: resourcesStackName,
    });
  });

  it('should be able to write to efs and read from it in a separate function', async function self() {
    try {
      await awsRequest('Lambda', 'invoke', {
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

    const readerResult = await awsRequest('Lambda', 'invoke', {
      FunctionName: `${stackName}-reader`,
      InvocationType: 'RequestResponse',
    });
    const payload = JSON.parse(readerResult.Payload);

    expect(payload).to.deep.equal({ result: 'fromlambda' });
    return null;
  });
});
