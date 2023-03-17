#!/usr/bin/env node

'use strict';

// Import required libraries
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const log = require('log').get('serverless');
const awsRequest = require('@serverless/test/aws-request');
const fsp = fs.promises;

// Set up logging
require('essentials');
require('log-node')();

// Set constants for CloudFormation stack names and secrets
const SHARED_INFRA_TESTS_CLOUDFORMATION_STACK = 'integration-tests-infrastructure';
const SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME = 'integration-tests-activemq-credentials';
const SHARED_INFRA_TESTS_RABBITMQ_CREDENTIALS_NAME = 'integration-tests-rabbitmq-credentials';

// Function to create the ActiveMQ credentials secret in AWS Secrets Manager
const ensureActiveMQCredentialsSecret = async () => {
  const ssmMqCredentials = {
    username: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_USER,
    password: process.env.SLS_INTEGRATION_TESTS_ACTIVE_MQ_PASSWORD,
  };
  log.notice('Creating SecretsManager ActiveMQ Credentials secret...');
  try {
    await awsRequest(AWS.SecretsManager, 'createSecret', {
      Name: SHARED_INFRA_TESTS_ACTIVE_MQ_CREDENTIALS_NAME,
      SecretString: JSON.stringify(ssmMqCredentials),
    });
  } catch (e) {
    if (!e.code === 'ResourceExistsException') {
      throw e;
    }
  }
};

// Function to create the RabbitMQ credentials secret in AWS Secrets Manager
const ensureRabbitMQCredentialsSecret = async () => {
  const ssmMqCredentials = {
    username: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_USER,
    password: process.env.SLS_INTEGRATION_TESTS_RABBITMQ_PASSWORD,
  };
  log.notice('Creating SecretsManager RabbitMQ Credentials secret...');
  try {
    await awsRequest(AWS.SecretsManager, 'createSecret', {
      Name: SHARED_INFRA_TESTS_RABBITMQ_CREDENTIALS_NAME,
      SecretString: JSON.stringify(ssmMqCredentials),
    });
  } catch (e) {
    if (!e.code === 'ResourceExistsException') {
      throw e;
    }
  }
};

// Set constants for MSK cluster and broker names
const activeMqBrokerName = 'integration-tests-activemq-broker';
const rabbitMqBrokerName = 'integration-tests-rabbitmq-broker';

// Function to create the infrastructure stack
async function handleInfrastructureCreation() {
  // Read the CloudFormation template and Kafka server properties files
  const [cfnTemplate, kafkaServerProperties] = await Promise.all([
    fsp.readFile(path.join(__dirname, 'cloudformation.yml'), 'utf8'),
    fsp.readFile(path.join(__dirname, 'kafka.server.properties')),
  ]);

  // Create the ActiveMQ and RabbitMQ credentials secrets
  await ensureActiveMQCredentialsSecret();
  await ensureRabbitMQCredentialsSecret();

  // Set the MSK cluster and configuration names
  const clusterName = 'integration-tests-msk-cluster';
  const clusterConfName = 'integration-tests-msk-cluster-configuration';

  // Create the MSK cluster configuration
  log.notice('Creating MSK Cluster configuration...');
  const clusterConfResponse = await awsRequest
