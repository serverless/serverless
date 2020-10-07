#!/usr/bin/env node

'use strict';

require('essentials');
require('log-node')();

const log = require('log').get('serverless');
const awsRequest = require('@serverless/test/aws-request');
const {
  SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  getDependencyStackOutputMap,
} = require('../../test/utils/cloudformation');

(async () => {
  log.notice('Starting teardown of integration infrastructure...');
  const describeClustersResponse = await awsRequest('Kafka', 'listClusters');
  const clusterConfArn =
    describeClustersResponse.ClusterInfoList[0].CurrentBrokerSoftwareInfo.ConfigurationArn;

  const outputMap = await getDependencyStackOutputMap();

  log.notice('Removing leftover ENI...');
  const describeResponse = await awsRequest('EC2', 'describeNetworkInterfaces', {
    Filters: [
      {
        Name: 'vpc-id',
        Values: [outputMap.get('VPC')],
      },
      {
        Name: 'status',
        Values: ['available'],
      },
    ],
  });
  try {
    await Promise.all(
      describeResponse.NetworkInterfaces.map(networkInterface =>
        awsRequest('EC2', 'deleteNetworkInterface', {
          NetworkInterfaceId: networkInterface.NetworkInterfaceId,
        })
      )
    );
  } catch (e) {
    log.error(`Error: ${e} while trying to remove leftover ENIs\n`);
  }
  log.notice('Removing integration tests CloudFormation stack...');
  await awsRequest('CloudFormation', 'deleteStack', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  await awsRequest('CloudFormation', 'waitFor', 'stackDeleteComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  log.notice('Removed integration tests CloudFormation stack!');
  log.notice('Removing MSK Cluster configuration...');
  await awsRequest('Kafka', 'deleteConfiguration', {
    Arn: clusterConfArn,
  });
  log.notice('Removed MSK Cluster configuration');
  log.notice('Teardown of integration infrastructure finished');
})();
