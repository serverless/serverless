'use strict';
const aws = require('aws-sdk');

module.exports = {
    Ref: (plugin, resource) => {
        return new Promise((resolve) => { resolve(resource.Properties.TableName); });
    },
    'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
        const dynamodb = new aws.DynamoDB(serviceConfig);
        return dynamodb.describeTable({
            TableName: resource.Properties.TableName
        }).promise()
        .then(table => {
            if(!table) {
                return parameters;
            }
            switch(parameters[1]) {
                case 'Arn':
                    return table.Table.TableArn;
                case 'StreamArn':
                    return table.Table.LatestStreamArn;
                default:
                    return parameters;
            }
        });
    }
};
