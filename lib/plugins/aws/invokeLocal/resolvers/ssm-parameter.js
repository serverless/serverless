const aws = require('aws-sdk');

async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    const cf = await getCFResources(serverless);
    const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
    if(!cfResource) {
        return action;
    }

    switch(action) {
        case 'Ref':
            if(!cfResource) {
                return action;
            }
            return cfResource.PhysicalResourceId;
        case 'Fn::GetAtt':
            const store = new aws.SSM(serviceConfig);
            const param = await store.getParameter({
                Name: cfResource.PhysicalResourceId
            }).promise();
            if(!param || !param.Parameter) {
                return action;
            }
            switch(parameters[1]) {
                case 'Type':
                    return param.Parameter.Type
                case 'Value':
                    return param.Parameter.Value
            }
            break;
    }
    return action;
}

module.exports = resolve;
