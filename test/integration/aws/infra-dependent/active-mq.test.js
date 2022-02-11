'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../../fixtures/programmatic');
const { confirmCloudWatchLogs } = require('../../../utils/misc');
const {
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
  SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME,
} = require('../../../utils/cloudformation');

const awsRequest = require('@serverless/test/aws-request');
const LambdaService = require('aws-sdk').Lambda;
const MQService = require('aws-sdk').MQ;
const SecretsManagerService = require('aws-sdk').SecretsManager;
const crypto = require('crypto');
const { deployService, removeService } = require('../../../utils/integration');

describe.skip('AWS - Active MQ Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  const stage = 'dev';

  const queueName = `testqueue${crypto.randomBytes(8).toString('hex')}`;

  before(async () => {
    const isDepsStackAvailable = await isDependencyStackAvailable();
    if (!isDepsStackAvailable) {
      throw new Error('CloudFormation stack with integration test dependencies not found.');
    }

    const outputMap = await getDependencyStackOutputMap();

    log.notice('Getting Active MQ Credentials ARN');
    const getSecretValueResponse = await awsRequest(SecretsManagerService, 'getSecretValue', {
      SecretId: SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME,
    });
    const { username: mqUsername, password: mqPassword } = JSON.parse(
      getSecretValueResponse.SecretString
    );

    const describeBrokerResponse = await awsRequest(MQService, 'describeBroker', {
      BrokerId: outputMap.get('ActiveMQBrokerId'),
    });
    const stompEndpoint = describeBrokerResponse.BrokerInstances[0].Endpoints.find((endpoint) =>
      endpoint.startsWith('stomp')
    );

    const serviceData = await fixtures.setup('function-active-mq', {
      configExt: {
        functions: {
          producer: {
            vpc: {
              subnetIds: [outputMap.get('PrivateSubnetA')],
              securityGroupIds: [outputMap.get('ActiveMQSecurityGroup')],
            },
            environment: {
              QUEUE_NAME: queueName,
              MQ_PASSWORD: mqPassword,
              MQ_USERNAME: mqUsername,
              MQ_HOST: stompEndpoint.split(':')[1].slice(2),
            },
          },
          consumer: {
            events: [
              {
                activemq: {
                  arn: outputMap.get('ActiveMQBrokerArn'),
                  queue: queueName,
                  basicAuthArn: getSecretValueResponse.ARN,
                },
              },
            ],
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
    if (serviceDir) {
      await removeService(serviceDir);
    }
  });

  it('correctly processes messages from Active MQ queue', async () => {
    const functionName = 'consumer';
    const message = 'Hello from Apache MQ Integration test!';

    const events = await confirmCloudWatchLogs(
      `/aws/lambda/${stackName}-${functionName}`,
      async () =>
        await awsRequest(LambdaService, 'invoke', {
          FunctionName: `${stackName}-producer`,
          InvocationType: 'RequestResponse',
        }),
      {
        checkIsComplete: (soFarEvents) =>
          soFarEvents.reduce((data, event) => data + event.message, '').includes(message),
      }
    );

    const logs = events.reduce((data, event) => data + event.message, '');
    expect(logs).to.include(functionName);
    expect(logs).to.include(message);
  });
});
