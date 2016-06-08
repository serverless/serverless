'use strict';

class AwsCompileS3Events {
  constructor(serverless) {
    this.serverless = serverless;

    this.hooks = {
      'deploy:compileEvents': this.compileS3Events.bind(this),
    };
  }

  compileS3Events(options) {
    this.options = options;

    if (!options.stage) {
      throw new this.serverless.Error('Please provide a stage');
    }

    if (!options.region) {
      throw new this.serverless.Error('Please provide a region');
    }

    this.compiledS3EventResources = [];

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

      // iterate over all defined buckets
      s3BucketObject.events.aws.s3.forEach((bucketName) => {
        // create the S3 bucket with the corresponding notification
        const newS3Bucket = JSON.parse(bucketTemplate);
        newS3Bucket.Properties.BucketName = `${this.serverless.service.service}-${bucketName}-${
          this.options.stage}-${this.options.region}`;
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
          [bucketResourceKey]: newS3Bucket,
        };

        this.compiledS3EventResources.push(newBucketObject);

        // create the corresponding Lambda permissions
        const newPermission = JSON.parse(permissionTemplate);
        newPermission.Properties.FunctionName = {
          'Fn::GetAtt': [
            functionName,
            'Arn',
          ],
        };

        const newPermissionObject = {
          [`${bucketResourceKey}Permission`]: newPermission,
        };

        this.compiledS3EventResources.push(newPermissionObject);
      });
    });

    this.serverless.service.compiledS3EventResources = this.compiledS3EventResources;
  }
}

module.exports = AwsCompileS3Events;
