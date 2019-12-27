const aws = require('aws-sdk');

async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    
    switch(action) {
        case 'Ref':
            return resource.Properties.TableName;
        case 'Fn::GetAtt':
            const dynamodb = new aws.DynamoDB(serviceConfig);
            const table = await dynamodb.describeTable({
                TableName: resource.Properties.TableName
            }).promise();
            if(!table) {
                return action;
            }
            switch(parameters[1]) {
                case 'Arn':
                    return table.Table.TableArn;
                case 'StreamArn':
                    return table.Table.LatestStreamArn;
            }
            break;
    }
    return action;
}

module.exports = resolve;
