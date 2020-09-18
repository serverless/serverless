'use strict';

const awsRequest = require('@serverless/test/aws-request');
const {
  SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  getDependencyStackOutputMap,
} = require('../../test/utils/cludformation');

(async () => {
  process.stdout.write('Starting teardown of integration infrastructure...\n');
  const describeClustersResponse = await awsRequest('Kafka', 'listClusters');
  const clusterConfArn =
    describeClustersResponse.ClusterInfoList[0].CurrentBrokerSoftwareInfo.ConfigurationArn;

  const outputMap = await getDependencyStackOutputMap();

  process.stdout.write('Removing leftover ENI...\n');
  const describeResponse = await awsRequest('EC2', 'describeNetworkInterfaces', {
    Filters: [
      {
        Name: 'vpc-id',
        Values: [outputMap.VPC],
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
    process.stdout.write(`Error: ${e} while trying to remove leftover ENIs\n`);
  }
  process.stdout.write('Removing integration tests CloudFormation stack...\n');
  await awsRequest('CloudFormation', 'deleteStack', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  await awsRequest('CloudFormation', 'waitFor', 'stackDeleteComplete', {
    StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  });
  process.stdout.write('Removed integration tests CloudFormation stack!\n');
  process.stdout.write('Removing MSK Cluster configuration...\n');
  await awsRequest('Kafka', 'deleteConfiguration', {
    Arn: clusterConfArn,
  });
  process.stdout.write('Removed MSK Cluster configuration\n');
  process.stdout.write('Teardown of integration infrastructure finished\n');
})();
