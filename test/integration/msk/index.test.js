'use strict';

const path = require('path');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures');
const { confirmCloudWatchLogs } = require('../../utils/misc');

const awsRequest = require('@serverless/test/aws-request');
const fs = require('fs');
const crypto = require('crypto');
const { deployService, removeService } = require('../../utils/integration');

describe('AWS - MSK Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  let clusterConfigurationArn;
  const stage = 'dev';

  const suffix = crypto.randomBytes(8).toString('hex');
  const resourcesStackName = `msk-integration-tests-deps-stack-${suffix}`;
  const clusterConfName = `msk-cluster-configuration-${suffix}`;
  const topicName = `msk-topic-${suffix}`;
  const clusterName = `msk-integration-tests-msk-cluster-${suffix}`;

  before(async () => {
    const cfnTemplate = fs.readFileSync(path.join(__dirname, 'cloudformation.yml'), 'utf8');
    const kafkaServerProperties = fs.readFileSync(path.join(__dirname, 'kafka.server.properties'));

    log.notice('Creating MSK Cluster configuration...');
    const clusterConfResponse = await awsRequest('Kafka', 'createConfiguration', {
      Name: clusterConfName,
      ServerProperties: kafkaServerProperties,
      KafkaVersions: ['2.2.1'],
    });

    clusterConfigurationArn = clusterConfResponse.Arn;
    const clusterConfigurationRevision = clusterConfResponse.LatestRevision.Revision.toString();

    log.notice('Deploying CloudFormation stack with required resources...');
    await awsRequest('CloudFormation', 'createStack', {
      StackName: resourcesStackName,
      TemplateBody: cfnTemplate,
      Parameters: [
        { ParameterKey: 'ClusterName', ParameterValue: clusterName },
        { ParameterKey: 'ClusterConfigurationArn', ParameterValue: clusterConfigurationArn },
        {
          ParameterKey: 'ClusterConfigurationRevision',
          ParameterValue: clusterConfigurationRevision,
        },
      ],
    });

    const waitForResult = await awsRequest('CloudFormation', 'waitFor', 'stackCreateComplete', {
      StackName: resourcesStackName,
    });

    const outputMap = waitForResult.Stacks[0].Outputs.reduce((map, output) => {
      map[output.OutputKey] = output.OutputValue;
      return map;
    }, {});

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
    log.notice('Removing service...');
    await removeService(servicePath);
    log.notice('Removing CloudFormation stack with required resources...');
    await awsRequest('CloudFormation', 'deleteStack', { StackName: resourcesStackName });
    await awsRequest('CloudFormation', 'waitFor', 'stackDeleteComplete', {
      StackName: resourcesStackName,
    });
    log.notice('Removing MSK Cluster configuration...');
    return awsRequest('Kafka', 'deleteConfiguration', {
      Arn: clusterConfigurationArn,
    });
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
