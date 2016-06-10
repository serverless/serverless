'use strict';

const merge = require('lodash').merge;

class AwsCompileS3Events {
  constructor(serverless) {
    this.serverless = serverless;

    this.hooks = {
      'deploy:compileEvents': this.compileS3Events.bind(this),
    };
  }

  compileS3Events() {
    if (!this.serverless.service.resources.aws.Resources) {
      throw new this.serverless.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    const bucketTemplate = `
      {
        "Type": "AWS::S3::Bucket",
        "Properties": {
          "BucketName": "BucketName",
          "NotificationConfiguration": "NotificationConfiguration"
        }
      }
    `;

    const permissionTemplate = `
      {
        "Type": "AWS::Lambda::Permission",
        "Properties": {
          "FunctionName": "FunctionName",
          "Action": "lambda:InvokeFunction",
          "Principal": "s3.amazonaws.com"
        } 
      }
    `;

    // iterate over all defined functions
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const s3BucketObject = this.serverless.service.getFunction(functionName);

      if (s3BucketObject.events.aws.s3) {
        // iterate over all defined buckets
        s3BucketObject.events.aws.s3.forEach((bucketName) => {
          // 1. create the S3 bucket with the corresponding notification
          const newS3Bucket = JSON.parse(bucketTemplate);
          newS3Bucket.Properties.BucketName = bucketName;
          newS3Bucket.Properties.NotificationConfiguration = {
            LambdaConfigurations: [
              {
                Event: 's3:ObjectCreated:*',
                Function: {
                  'Fn::GetAtt': [
                    functionName,
                    'Arn',
                  ],
                },
              },
            ],
          };

          const bucketResourceKey = bucketName.replace(/-/g, '');

          const newBucketObject = {
            [`${bucketResourceKey}S3Event`]: newS3Bucket,
          };

          // 2. create the corresponding Lambda permissions
          const newPermission = JSON.parse(permissionTemplate);
          newPermission.Properties.FunctionName = {
            'Fn::GetAtt': [
              functionName,
              'Arn',
            ],
          };

          const newPermissionObject = {
            [`${bucketResourceKey}S3EventPermission`]: newPermission,
          };

          // merge the new bucket and permission objects into the Resources section
          merge(this.serverless.service.resources.aws.Resources,
            newBucketObject, newPermissionObject);
        });
      }
    });
  }
}

module.exports = AwsCompileS3Events;
