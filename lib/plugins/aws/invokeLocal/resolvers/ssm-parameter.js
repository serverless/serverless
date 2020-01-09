'use strict';
const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
        const cf = await resolvers.getCFResources(serviceConfig);
        const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
        if(!cfResource) {
            return parameters;
        }
        
        const store = new aws.SSM(serviceConfig);
        const param = await store.getParameter({
            Name: cfResource.PhysicalResourceId
        }).promise();
        if(!param || !param.Parameter) {
            return parameters;
        }
        switch(parameters[1]) {
            case 'Type':
                return param.Parameter.Type
            case 'Value':
                return param.Parameter.Value
            default:
                return parameters;
        }
    }
}
