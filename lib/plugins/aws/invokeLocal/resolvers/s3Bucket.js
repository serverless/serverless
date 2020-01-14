'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'Arn':
        return new Promise(resolve => {
          resolve(`arn:aws:s3:::${resource.Properties.BucketName}`);
        });
      case 'DomainName':
        return new Promise(resolve => {
          resolve(`${resource.Properties.BucketName}.s3.amazonaws.com`);
        });
      default:
        return new Promise(resolve => {
          resolve(parameters);
        });
    }
  },
};
