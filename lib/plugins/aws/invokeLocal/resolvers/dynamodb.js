'use strict';
const aws = require('aws-sdk');

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    const dynamodb = new aws.DynamoDB(serviceConfig);
    return dynamodb.describeTable({
        TableName: resource.Properties.TableName,
      })
      .promise()
      .then(table => {
        if (!table) {
          throw new Error(`Could not resolve table ${resourceName} in aws`);
        }
        switch (parameters[1]) {
          case 'Arn':
            return table.Table.TableArn;
          case 'StreamArn':
            return table.Table.LatestStreamArn;
          default:
            throw new ServerlessError(`Could not resolve ${resourceName} ${parameters[1]}`);
        }
      });
  },
};
