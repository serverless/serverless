async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    
    switch(action) {
        case 'Ref':
            return resource.Properties.BucketName;
        case 'Fn::GetAtt':
            switch(parameters[1]) {
                case 'Arn':
                    return `arn:aws:s3:::${resource.Properties.BucketName}`;
                case 'DomainName':
                    return `${resource.Properties.BucketName}.s3.amazonaws.com`;
            }
            break;
    }
    return action;
}

module.exports = resolve;
