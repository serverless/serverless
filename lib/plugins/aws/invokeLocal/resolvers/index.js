'use strict';
const aws = require('aws-sdk');

let cfResources = null;

function getCFResources(serviceConfig) {
    if(!cfResources) {
        const cf = new aws.CloudFormation(serviceConfig);
        const serverless = module.exports.serverless;

        cfResources = cf.describeStackResources({
            StackName: `${serverless.service.service}-${serverless.service.provider.stage}`
        }).promise()
        .then(resources => {
            return resources.StackResources;
        });
    }
    return cfResources;
}

function resolveResourceId(plugin, resource, resourceName, parameters, serviceConfig) {
    return getCFResources(serviceConfig)
    .then(cf => {
        const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
        if(!cfResource) {
            return parameters;
        }
        return cfResource.PhysicalResourceId;
    });
}

module.exports.getCFResources = getCFResources;
module.exports.resolveResourceId = resolveResourceId;
module.exports.serverless = null;