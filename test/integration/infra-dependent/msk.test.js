'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures');
const { confirmCloudWatchLogs } = require('../../utils/misc');
const {
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
} = require('../../utils/cloudformation');

const awsRequest = require('@serverless/test/aws-request');
const crypto = require('crypto');
const { deployService, removeService } = require('../../utils/integration');

describe('AWS - MSK Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  const stage = 'dev';

  const topicName = `msk-topic-${crypto.randomBytes(8).toString('hex')}`;

  before(async () => {
    const isDepsStackAvailable = await isDependencyStackAvailable();
    if (!isDepsStackAvailable) {
      throw new Error('CloudFormation stack with integration test dependencies not found.');
    }

    const outputMap = await getDependencyStackOutputMap();

    log.notice('Getting MSK Boostrap Brokers URLs...');
    const getBootstrapBrokersResponse = await awsRequest('Kafka', 'getBootstrapBrokers', {
      ClusterArn: outputMap.get('MSKCluster'),
    });
    const brokerUrls = getBootstrapBrokersResponse.BootstrapBrokerStringTls;

    const serviceData = await fixtures.setup('functionMsk', {
      configExt: {
        functions: {
          producer: {
            vpc: {
              subnetIds: [outputMap.get('PrivateSubnetA')],
              securityGroupIds: [outputMap.get('SecurityGroup')],
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
                  arn: outputMap.get('MSKCluster'),
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
    await deployService(servicePath);
  });

  after(async () => {
    if (servicePath) {
      await removeService(servicePath);
    }
  });

  it('correctly processes messages from MSK topic', async () => {
    const functionName = 'consumer';
    const message = 'Hello from MSK Integration test!';

    const events = await confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-${functionName}`,
      async () =>
        await awsRequest('Lambda', 'invoke', {
          FunctionName: `${stackName}-producer`,
          InvocationType: 'RequestResponse',
        }),
      { timeout: 120 * 1000 }
    );

    const logs = events.reduce((data, event) => data + event.message, '');
    expect(logs).to.include(functionName);
    expect(logs).to.include(message);
  });
});
