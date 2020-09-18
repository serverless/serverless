'use strict';

const awsRequest = require('@serverless/test/aws-request');
const fs = require('fs');
const path = require('path');
const { SHARED_INFRA_TESTS_CLOUDFORMATION_STACK } = require('../../test/utils/cludformation');

(async () => {
  process.stdout.write('Starting setup of integration infrastructure...\n');
  const cfnTemplate = fs.readFileSync(path.join(__dirname, 'cloudformation.yml'), 'utf8');
  const kafkaServerProperties = fs.readFileSync(path.join(__dirname, 'kafka.server.properties'));

  process.stdout.write('Checking if integration tests CloudFormation stack already exists...\n');
  try {
    await awsRequest('CloudFormation', 'describeStacks', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    });
    process.stdout.write('Integration tests CloudFormation stack already exists. Quitting.\n');
    return;
  } catch (e) {
    process.stdout.write('Integration tests CloudFormation does not exist. Continuing.\n');
  }

  const clusterName = 'integration-tests-msk-cluster';
  const clusterConfName = 'integration-tests-msk-cluster-configuration';

  process.stdout.write('Creating MSK Cluster configuration...\n');
  let clusterConfResponse;
  try {
    clusterConfResponse = await awsRequest('Kafka', 'createConfiguration', {
      Name: clusterConfName,
      ServerProperties: kafkaServerProperties,
      KafkaVersions: ['2.2.1'],
    });
  } catch (e) {
    process.stdout.write(
      `Error: ${e} while trying to create MSK Cluster configuration. Quitting. \n`
    );
    return;
  }

  const clusterConfigurationArn = clusterConfResponse.Arn;
  const clusterConfigurationRevision = clusterConfResponse.LatestRevision.Revision.toString();

  process.stdout.write('Deploying integration tests CloudFormation stack...\n');
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
  process.stdout.write('Deployed integration tests CloudFormation stack!\n');
  process.stdout.write('Setup of integration infrastructure finished\n');
})();
