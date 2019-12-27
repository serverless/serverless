const aws = require('aws-sdk');
const fs = require('fs');

const handlers = {
    'AWS::S3::Bucket': require('./s3'),
    'AWS::DynamoDB::Table': require('./dynamodb'),
    'AWS::SNS::Topic': require('./sns'),
    'AWS::SQS::Queue': require('./sqs'),
    'AWS::Lambda::Function': require('./lambda')
};

let cfrServerless = null;
let cfResources = null;
let cfExports = null;
let serviceConfig = null;
let cache = null;
const cacheFilePath = '.serverless/invoke.cache.json';

async function getCFResources(serverless) {
    if(cfrServerless === serverless) {
        return cfResources;
    }

    const cf = new aws.CloudFormation(serviceConfig);

    const resources = await cf.describeStackResources({
        StackName: `${serverless.service.service}-${serverless.service.provider.stage}`
    }).promise();

    return resources.StackResources;
}

module.exports = async (name, environment, serverless, credentialEnvVars) => {
    if(!cache) {
        if(fs.existsSync(cacheFilePath)) {
            try {
                cache = JSON.parse(fs.readFileSync(cacheFilePath).toString('utf-8'));
            } catch (err) {
                cache = {};
            }
        } else {
            cache = {};
        }
    }
    const value = environment[name];
    const accessKey = credentialEnvVars.AWS_ACCESS_KEY_ID;
    const secret = credentialEnvVars.AWS_SECRET_ACCESS_KEY;
    serviceConfig = {
        region: (credentialEnvVars.AWS_REGION)? credentialEnvVars.AWS_REGION : serverless.service.provider.region,
        credentials: (accessKey)? new AWS.Credentials(accessKey, secret) : undefined
    };

    if(typeof value != 'object') {
        return;
    }

    const keys = Object.keys(value);
    if(keys.length != 1) {
        // Not sure how to handle this where an environment variable has multiple opperators
        return;
    }
    const action = keys[0];

    let resourceName = null;
    let importName = null;
    switch(action) {
        case 'Ref':
            resourceName = value[action];
            break;
        case 'Fn::GetAtt':
            resourceName = value[action][0];
            break;
        case 'Fn::ImportValue':
            importName = value[action];
            break;
    }

    if(cache[action] && cache[action][resourceName]) {
        switch(action) {
            case 'Ref':
            case 'Fn::ImportValue':
                environment[name] = cache[action][resourceName];
                return;
            case 'Fn::GetAtt':
                const val = cache[action][resourceName][value[action][1]];
                if(val) {
                    environment[name] = val;
                    return;
                }
                break;
        }
    }

    if(resourceName) {
        let resource = serverless.service.resources.Resources[resourceName];
        if(!resource && resourceName.endsWith('LambdaFunction')) {
            let lambdaName = resourceName.substr(0, resourceName.length - 'LambdaFunction'.length);
            let func = serverless.service.functions[lambdaName];
            if(!func) {
                const lowerLambdaName = lambdaName.substr(0, 1).toLowerCase() + lambdaName.substr(1, lambdaName.length - 1);
                func = serverless.service.functions[lowerLambdaName];
                lambdaName = lowerLambdaName;
            }
            if(func) {
                resource = {
                    Type: "AWS::Lambda::Function",
                    Properties: {
                        FunctionName: `${serverless.service.service}-${serverless.service.provider.stage}-${lambdaName}`
                    }
                };
            }
        }
        if(resource) {
            const handler = handlers[resource.Type];
            if(handler) {
                environment[name] = await handler(action, value[action], resourceName, resource, getCFResources, serverless, serviceConfig);
            } else {
                return;
            }
        }
    } else if(importName) {
        if(!cfExports) {
            const cf = new aws.CloudFormation(serviceConfig);
            cfExports = [];
            let token = undefined;
            do {
                const result = await cf.listExports({ NextToken: token}).promise();
                if(result.Exports) {
                    cfExports.push(...result.Exports);
                }
                token = result.NextToken;
            } while(token);
        }

        const exp = cfExports.find(x => x.Name == importName);
        if(exp) {
            environment[name] = exp.Value;
        } else {
            return;
        }
    }

    if(!cache[action]) {
        cache[action] = {};
    }
    switch(action) {
        case 'Ref':
        case 'Fn::ImportValue':
            cache[action][resourceName] = environment[name];
            return;
        case 'Fn::GetAtt':
            if(!cache[action][resourceName]) {
                cache[action][resourceName] = {};
            }
            cache[action][resourceName][value[action][1]] = environment[name];
            break;
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(cache));
}
