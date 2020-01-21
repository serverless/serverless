'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    return plugin.provider
      .request('DynamoDB', 'describeTable', {
        TableName: resource.PhysicalResourceId,
      })
      .then(table => {
        if (!table) {
          throw new ServerlessError(`Could not resolve table ${resourceName} in aws`);
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
