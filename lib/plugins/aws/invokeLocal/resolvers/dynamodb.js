const aws = require('aws-sdk');

module.exports = {
    Ref: (resource) => {
        return resource.Properties.TableName;
    },
    'Fn::GetAtt': async (resource, resourceName, parameters, serviceConfig) => {
        const dynamodb = new aws.DynamoDB(serviceConfig);
        const table = await dynamodb.describeTable({
            TableName: resource.Properties.TableName
        }).promise();
        if(!table) {
            return parameters;
        }
        switch(parameters[1]) {
            case 'Arn':
                return table.Table.TableArn;
            case 'StreamArn':
                return table.Table.LatestStreamArn;
        }
    }
};
