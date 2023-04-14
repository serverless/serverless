'use strict';

const resolveLambdaTarget = require('../../../../utils/resolve-lambda-target');

const dependsOn = ['IamRoleLambdaExecution'];

function compile() {
  const statement =
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution
      .Properties.Policies[0].PolicyDocument.Statement;

  const permissions = {
    Effect: 'Allow',
    Action: [
      'rds:DescribeDBClusters',
      'rds:DescribeDBClusterParameters',
      'rds:DescribeDBSubnetGroups',
      'ec2:CreateNetworkInterface',
      'ec2:DescribeNetworkInterfaces',
      'ec2:DescribeVpcs',
      'ec2:DeleteNetworkInterface',
      'ec2:DescribeSubnets',
      'ec2:DescribeSecurityGroups',
      'kms:Decrypt',
      'secretsmanager:GetSecretValue',
    ],
    Resource: '*',
  };

  let count = 0;

  this.serverless.service.getAllFunctions().forEach((functionName) => {
    const functionObj = this.serverless.service.getFunction(functionName);

    functionObj.events.forEach((event, i) => {
      if (!event.documentDb) {
        return;
      }
      const FunctionName = resolveLambdaTarget(functionName, functionObj);

      const { documentDb } = event;
      const logicalId = this.provider.naming.getDocDbStreamLogicalId(functionName, i);

      const streamResource = {
        [logicalId]: {
          Type: 'AWS::Lambda::EventSourceMapping',
          DependsOn: dependsOn,
          Properties: {
            BatchSize: documentDb.batchSize || 100,
            MaximumBatchingWindowInSeconds: documentDb.batchWindow,
            Enabled: typeof documentDb.enabled === 'boolean' ? documentDb.enabled : true,
            EventSourceArn: documentDb.cluster,
            FunctionName,
            StartingPosition: documentDb.startingPosition || 'LATEST',
            DocumentDBEventSourceConfig: {
              CollectionName: documentDb.collection,
              DatabaseName: documentDb.db,
              FullDocument: documentDb.document || 'Default',
            },
            SourceAccessConfigurations: [
              {
                Type: documentDb.auth || 'BASIC_AUTH',
                URI: documentDb.smk,
              },
            ],
          },
        },
      };

      Object.assign(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        streamResource
      );
      count++;
    });
  });

  if (count) {
    statement.push(permissions);
  }
}

module.exports = compile;
