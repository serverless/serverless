#!/usr/bin/env node

'use strict';

require('essentials');
require('log-node')();

const log = require('log').get('serverless');
const awsRequest = require('@serverless/test/aws-request');
const fsp = require('fs').promises;
const path = require('path');
const CloudFormationService = require('aws-sdk').CloudFormation;
const SecretsManagerService = require('aws-sdk').SecretsManager;
const KafkaService = require('aws-sdk').Kafka;

const {
  SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME,
  SHARED_INFRA_TESTS_RABBITMQ_CREDENTIALS_NAME,
} = require('../../../test/utils/cloudformation');

const ensureActiveMQCredentialsSecret = async () => {
  const ssmMqCredentials = {
    username: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER,
    password: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD,
  };
  log.notice('Creating SecretsManager ActiveMQ Credentials secret...');
  try {
    await awsRequest(SecretsManagerService, 'createSecret', {
      Name: SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME,
      SecretString: JSON.stringify(ssmMqCredentials),
    });
  } catch (e) {
    if (!e.code === 'ResourceExistsException') {
      throw e;
    }
  }
};

const ensureRabbitMQCredentialsSecret = async () => {
  const ssmMqCredentials = {
    username: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_USER,
    password: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD,
  };
  log.notice('Creating SecretsManager RabbitMQ Credentials secret...');
  try {
    await awsRequest(SecretsManagerService, 'createSecret', {
      Name: SHARED_INFRA_TESTS_RABBITMQ_CREDENTIALS_NAME,
      SecretString: JSON.stringify(ssmMqCredentials),
    });
  } catch (e) {
    if (!e.code === 'ResourceExistsException') {
      throw e;
    }
  }
};

const activeMqBrokerName = 'integration-tests-activemq-broker';
const rabbitMqBrokerName = 'integration-tests-rabbitmq-broker';

async function handleInfrastructureCreation() {
  const [cfnTemplate, kafkaServerProperties] = await Promise.all([
    fsp.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8'),
    fsp.readFile(path.join(__dirname, 'kafka.server.properties')),
  ]);

  await ensureActiveMQCredentialsSecret();
  await ensureRabbitMQCredentialsSecret();

  const clusterName = 'integration-tests-msk-cluster';
  const clusterConfName = 'integration-tests-msk-cluster-configuration';

  log.notice('Creating MSK Cluster configuration...');
  const clusterConfResponse = await awsRequest(KafkaService, 'createConfiguration', {
    Name: clusterConfName,
    ServerProperties: kafkaServerProperties,
    KafkaVersions: ['2.2.1'],
  });

  const clusterConfigurationArn = clusterConfResponse.Arn;
  const clusterConfigurationRevision = clusterConfResponse.LatestRevision.Revision.toString();

  log.notice('Deploying integration tests CloudFormation stack...');
  await awsRequest(CloudFormationService, 'createStack', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    TemplateBody: cfnTemplate,
    Parameters: [
      { ParameterKey: 'ClusterName', ParameterValue: clusterName },
      { ParameterKey: 'ActiveMQBrokerName', ParameterValue: activeMqBrokerName },
      {
        ParameterKey: 'ActiveMQUser',
        ParameterValue: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER,
      },
      {
        ParameterKey: 'ActiveMQPassword',
        ParameterValue: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD,
      },
      { ParameterKey: 'RabbitMQBrokerName', ParameterValue: rabbitMqBrokerName },
      {
        ParameterKey: 'RabbitMQUser',
        ParameterValue: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_USER,
      },
      {
        ParameterKey: 'RabbitMQPassword',
        ParameterValue: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD,
      },
      { ParameterKey: 'ClusterConfigurationArn', ParameterValue: clusterConfigurationArn },
      {
        ParameterKey: 'ClusterConfigurationRevision',
        ParameterValue: clusterConfigurationRevision,
      },
    ],
  });

  await awsRequest(CloudFormationService, 'waitFor', 'stackCreateComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  log.notice('Deployed integration tests CloudFormation stack!');
}

async function handleInfrastructureUpdate() {
  log.notice('Updating integration tests CloudFormation stack...');

  await ensureActiveMQCredentialsSecret();
  await ensureRabbitMQCredentialsSecret();

  const cfnTemplate = await fsp.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8');

  try {
    await awsRequest(CloudFormationService, 'updateStack', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
      TemplateBody: cfnTemplate,
      Parameters: [
        { ParameterKey: 'ClusterName', UsePreviousValue: true },
        { ParameterKey: 'ActiveMQBrokerName', ParameterValue: activeMqBrokerName },
        {
          ParameterKey: 'ActiveMQUser',
          ParameterValue: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER,
        },
        {
          ParameterKey: 'ActiveMQPassword',
          ParameterValue: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD,
        },
        { ParameterKey: 'RabbitMQBrokerName', ParameterValue: rabbitMqBrokerName },
        {
          ParameterKey: 'RabbitMQUser',
          ParameterValue: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_USER,
        },
        {
          ParameterKey: 'RabbitMQPassword',
          ParameterValue: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD,
        },
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

  await awsRequest(CloudFormationService, 'waitFor', 'stackUpdateComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  log.notice('Updated integration tests CloudFormation stack!');
}

(async () => {
  log.notice('Starting setup of integration infrastructure...');

  if (!process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER) {
    log.error(
      '"SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER" env variable has to be set when provisioning integration infrastructure'
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD) {
    log.error(
      '"SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD" env variable has to be set when provisioning integration infrastructure'
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.SLS_INTEGRATION_TESTS_RABBITMQ_USER) {
    log.error(
      '"SLS_INTEGRATION_TESTS_RABBITMQ_USER" env variable has to be set when provisioning integration infrastructure'
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD) {
    log.error(
      '"SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD" env variable has to be set when provisioning integration infrastructure'
    );
    process.exitCode = 1;
    return;
  }

  let describeResponse;

  log.notice('Checking if integration tests CloudFormation stack already exists...');
  try {
    describeResponse = await awsRequest(CloudFormationService, 'describeStacks', {
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

    if (['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stackStatus)) {
      await handleInfrastructureUpdate();
    } else {
      log.error(`Existing stack has status: ${stackStatus} and it cannot be updated.`);
      process.exitCode = 1;
    }
  } else {
    await handleInfrastructureCreation();
  }

  log.notice('Setup of integration infrastructure finished');
})();
