module.exports = {
    Ref: (resource) => {
        return resource.Properties.BucketName;
    },
    'Fn::GetAtt': (resource, resourceName, parameters) => {
        switch(parameters[1]) {
            case 'Arn':
                return `arn:aws:s3:::${resource.Properties.BucketName}`;
            case 'DomainName':
                return `${resource.Properties.BucketName}.s3.amazonaws.com`;
        }
    }
}
