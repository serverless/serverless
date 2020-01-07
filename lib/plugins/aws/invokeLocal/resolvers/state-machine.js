const aws = require('aws-sdk');
async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    const cf = await getCFResources(serverless);
    const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
    if(!cfResource) {
        return action;
    }
    
    switch(action) {
        case 'Ref':
            return cfResource.PhysicalResourceId;
        case 'Fn::GetAtt':
            switch(parameters[1]) {
                case 'Name':
                    const lastIndex = cfResource.PhysicalResourceId.lastIndexOf(':')
                    return cfResource.PhysicalResourceId.substr(lastIndex + 1);
            }
            break;
    }
    return action;
}

module.exports = resolve;
