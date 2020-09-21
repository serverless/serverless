#!/usr/bin/env node

'use strict';

require('essentials');
require('log-node')();

const log = require('log').get('serverless:scripts');
const awsRequest = require('@serverless/test/aws-request');
const fsPromises = require('fs').promises;
const path = require('path');
const { SHARED_INFRA_TESTS_CLOUDFORMATION_STACK } = require('../../../test/utils/cludformation');

(async () => {
  log.notice('Starting setup of integration infrastructure...');

  const [cfnTemplate, kafkaServerProperties] = await Promise.all([
    fsPromises.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8'),
    fsPromises.readFile(path.join(__dirname, 'kafka.server.properties')),
  ]);

  log.notice('Checking if integration tests CloudFormation stack already exists...');
  try {
    await awsRequest('CloudFormation', 'describeStacks', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    });
    log.error('Integration tests CloudFormation stack already exists. Quitting.');
    return;
  } catch (e) {
    if (e.code !== 'ValidationError') {
      throw e;
    }
  }
  log.notice('Integration tests CloudFormation does not exist. Continuing.');

  const clusterName = 'integration-tests-msk-cluster';
  const clusterConfName = 'integration-tests-msk-cluster-configuration';

  log.notice('Creating MSK Cluster configuration...');
  const clusterConfResponse = await awsRequest('Kafka', 'createConfiguration', {
    Name: clusterConfName,
    ServerProperties: kafkaServerProperties,
    KafkaVersions: ['2.2.1'],
  });

  const clusterConfigurationArn = clusterConfResponse.Arn;
  const clusterConfigurationRevision = clusterConfResponse.LatestRevision.Revision.toString();

  log.notice('Deploying integration tests CloudFormation stack...');
  await awsRequest('CloudFormation', 'createStack', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
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

  await awsRequest('CloudFormation', 'waitFor', 'stackCreateComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  log.notice('Deployed integration tests CloudFormation stack!');
  log.notice('Setup of integration infrastructure finished');
})();
