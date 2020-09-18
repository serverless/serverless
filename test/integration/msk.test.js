'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../fixtures');
const { confirmCloudWatchLogs } = require('../utils/misc');
const {
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
} = require('../utils/cludformation');

const awsRequest = require('@serverless/test/aws-request');
const crypto = require('crypto');
const { deployService, removeService } = require('../utils/integration');

describe('AWS - MSK Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  const stage = 'dev';

  const topicName = `msk-topic-${crypto.randomBytes(8).toString('hex')}`;

  before(async function beforeHook() {
    const isDepsStackAvailable = await isDependencyStackAvailable();
    if (!isDepsStackAvailable) {
      log.notice(
        'CloudFormation stack with integration test dependencies not found. Skipping test.'
      );
      this.skip();
    }

    const outputMap = await getDependencyStackOutputMap();

    log.notice('Getting MSK Boostrap Brokers URLs...');
    const getBootstrapBrokersResponse = await awsRequest('Kafka', 'getBootstrapBrokers', {
      ClusterArn: outputMap.MSKCluster,
    });
    const brokerUrls = getBootstrapBrokersResponse.BootstrapBrokerStringTls;

    const serviceData = await fixtures.setup('functionMsk', {
      configExt: {
        functions: {
          producer: {
            vpc: {
              subnetIds: [outputMap.PrivateSubnetA],
              securityGroupIds: [outputMap.SecurityGroup],
            },
            environment: {
              TOPIC_NAME: topicName,
              BROKER_URLS: brokerUrls,
            },
          },
          consumer: {
            events: [
              {
                msk: {
                  arn: outputMap.MSKCluster,
                  topic: topicName,
                },
              },
            ],
          },
        },
      },
    });

    ({ servicePath } = serviceData);

    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    log.notice(`Deploying "${stackName}" service...`);
    await deployService(servicePath);
  });

  after(async () => {
    if (servicePath) {
      log.notice('Removing service...');
      await removeService(servicePath);
    }
  });

  it('correctly processes messages from MSK topic', async () => {
    const functionName = 'consumer';
    const message = 'Hello from MSK Integration test!';

    return confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-${functionName}`,
      async () =>
        await awsRequest('Lambda', 'invoke', {
          FunctionName: `${stackName}-producer`,
          InvocationType: 'RequestResponse',
        }),
      { timeout: 120 * 1000 }
    ).then(events => {
      const logs = events.reduce((data, event) => data + event.message, '');
      expect(logs).to.include(functionName);
      expect(logs).to.include(message);
    });
  });
});
