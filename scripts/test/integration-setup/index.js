#!/usr/bin/env node

'use strict';

require('essentials');
require('log-node')();

const log = require('log').get('serverless');
const awsRequest = require('@serverless/test/aws-request');
const fsPromises = require('fs').promises;
const path = require('path');
const { SHARED_INFRA_TESTS_CLOUDFORMATION_STACK } = require('../../../test/utils/cloudformation');

async function handleInfrastructureCreation() {
  const [cfnTemplate, kafkaServerProperties] = await Promise.all([
    fsPromises.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8'),
    fsPromises.readFile(path.join(__dirname, 'kafka.server.properties')),
  ]);

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
}

async function handleInfrastructureUpdate() {
  log.notice('Updating integration tests CloudFormation stack...');

  const cfnTemplate = await fsPromises.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8');

  try {
    await awsRequest('CloudFormation', 'updateStack', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
      TemplateBody: cfnTemplate,
      Parameters: [
        { ParameterKey: 'ClusterName', UsePreviousValue: true },
        { ParameterKey: 'ClusterConfigurationArn', UsePreviousValue: true },
        {
          ParameterKey: 'ClusterConfigurationRevision',
          UsePreviousValue: true,
        },
      ],
    });
  } catch (e) {
    if (e.message === 'No updates are to be performed.') {
      log.notice('No changes detected. Integration tests CloudFormation stack is up to date.');
      return;
    }
    throw e;
  }

  await awsRequest('CloudFormation', 'waitFor', 'stackUpdateComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  log.notice('Updated integration tests CloudFormation stack!');
}

(async () => {
  log.notice('Starting setup of integration infrastructure...');

  let describeResponse;

  log.notice('Checking if integration tests CloudFormation stack already exists...');
  try {
    describeResponse = await awsRequest('CloudFormation', 'describeStacks', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    });
    log.notice('Integration tests CloudFormation stack already exists');
  } catch (e) {
    if (e.code !== 'ValidationError') {
      throw e;
    }
    log.notice('Integration tests CloudFormation does not exist');
  }

  if (describeResponse) {
    const stackStatus = describeResponse.Stacks[0].StackStatus;

    if (['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stackStatus)) {
      await handleInfrastructureUpdate();
    } else {
      log.error('Existing stack has status: {stackStatus} and it cannot be updated.');
      process.exitCode = 1;
    }
  } else {
    await handleInfrastructureCreation();
  }

  log.notice('Setup of integration infrastructure finished');
})();
