'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    return plugin.provider.request('DynamoDB', 'describeTable', {
      TableName: resource.Properties.TableName,
    }).then(table => {
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
