'use strict';

const path = require('path');
const { expect } = require('chai');

const awsRequest = require('@serverless/test/aws-request');
const fs = require('fs');
const { getTmpDirPath } = require('../../utils/fs');
const crypto = require('crypto');
const { createTestService, deployService, removeService } = require('../../utils/integration');

const EFS_MAX_PROPAGATION_TIME = 1000 * 60 * 5;

describe('AWS - FileSystemConfig Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let startTime;
  let tmpDirPath;
  const stage = 'dev';
  const resourcesStackName = `efs-integration-tests-deps-stack-${crypto
    .randomBytes(8)
    .toString('hex')}`;

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const cfnTemplate = fs.readFileSync(path.join(__dirname, 'cloudformation.yml'), 'utf8');

    console.info('Deploying CloudFormation stack with required resources...');
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

    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      serverlessConfigHook: config => {
        const fileSystemConfig = {
          localMountPath: '/mnt/testing',
          arn: outputMap.AccessPointARN,
        };
        config.provider.vpc = {
          subnetIds: [outputMap.Subnet],
          securityGroupIds: [outputMap.SecurityGroup],
        };
        config.functions.writer.fileSystemConfig = fileSystemConfig;
        config.functions.reader.fileSystemConfig = fileSystemConfig;
      },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    await deployService(tmpDirPath);
    startTime = Date.now();
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info('Removing CloudFormation stack with required resources...');
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
      if (
        e.code === 'EFSMountFailureException' &&
        Date.now() - startTime < EFS_MAX_PROPAGATION_TIME
      ) {
        console.info('Failed to invoke, retry');
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
