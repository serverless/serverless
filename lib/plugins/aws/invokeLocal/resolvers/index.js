const aws = require('aws-sdk');
const fs = require('fs');

let cfResources = null;

async function getCFResources() {
    if(!cfResources) {
        const cf = new aws.CloudFormation(serviceConfig);
        const serverless = module.exports.serverless;

        const resources = await cf.describeStackResources({
            StackName: `${serverless.service.service}-${serverless.service.provider.stage}`
        }).promise();

        cfResources = resources.StackResources;
    }
    return cfResources;
}

async function resolveResourceId(resource, resourceName, parameters, serviceConfig) {
    const cf = await getCFResources(serverless);
    const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
    if(!cfResource) {
        return action;
    }
    return cfResource.PhysicalResourceId;
}

module.exports.getCFResources = getCFResources;
module.exports.resolveResourceId = resolveResourceId;
module.exports.serverless = null;