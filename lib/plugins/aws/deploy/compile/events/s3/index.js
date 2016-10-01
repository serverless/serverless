'use strict';

const _ = require('lodash');

const naming = require('./../../../../lib/naming.js');

class AwsCompileS3Events {
  constructor(serverless) {
    this.serverless = serverless;
    naming.configure(this.serverless);
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileS3Events.bind(this),
    };
  }

  compileS3Events() {
    const bucketsLambdaConfigurations = {};
    const s3EnabledFunctions = [];
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.s3) {
            let bucketName;
            let notificationEvent = 's3:ObjectCreated:*';

            if (typeof event.s3 === 'object') {
              if (!event.s3.bucket) {
                const errorMessage = [
                  `Missing "bucket" property for s3 event in function ${functionName}.`,
                  ' The correct syntax is: s3: bucketName OR an object with "bucket" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              bucketName = event.s3.bucket;
              if (event.s3.event) {
                notificationEvent = event.s3.event;
              }
            } else if (typeof event.s3 === 'string') {
              bucketName = event.s3;
            } else {
              const errorMessage = [
                `S3 event of function ${functionName} is not an object nor a string.`,
                ' The correct syntax is: s3: bucketName OR an object with "bucket" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            // check if the bucket already defined
            // in another S3 event in the service
            if (bucketsLambdaConfigurations[bucketName]) {
              const newLambdaConfiguration = {
                Event: notificationEvent,
                Function: {
                  'Fn::GetAtt': [
                    naming.getLogicalLambdaName(functionName),
                    'Arn',
                  ],
                },
              };

              bucketsLambdaConfigurations[bucketName]
                .push(newLambdaConfiguration);
            } else {
              bucketsLambdaConfigurations[bucketName] = [
                {
                  Event: notificationEvent,
                  Function: {
                    'Fn::GetAtt': [
                      naming.getLogicalLambdaName(functionName),
                      'Arn',
                    ],
                  },
                },
              ];
            }
            s3EnabledFunctions.push(functionName);
          }
        });
      }
    });

    // iterate over all buckets to be created
    // and compile them to CF resources
    _.forEach(bucketsLambdaConfigurations, (bucketLambdaConfiguration, bucketName) => {
      const bucketTemplate = {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: bucketName,
          NotificationConfiguration: {
            LambdaConfigurations: bucketLambdaConfiguration,
          },
        },
      };

      const bucketLogicalID = naming.getLogicalBucketName(bucketName);
      const bucketCFResource = {
        [bucketLogicalID]: bucketTemplate,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        bucketCFResource);
    });

    // iterate over all functions with S3 events
    // and give S3 permission to invoke them all
    // by adding Lambda::Permission resource for each
    s3EnabledFunctions.forEach(functionName => {
      const logicalFunctionName = naming.getLogicalLambdaName(functionName);
      const permissionTemplate = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: { 'Fn::GetAtt': [logicalFunctionName, 'Arn'] },
          Action: 'lambda:InvokeFunction',
          Principal: 's3.amazonaws.com',
        },
      };

      const permissionLogicalID = naming.getLambdaS3PermissionName(functionName);
      const permissionCFResource = {
        [permissionLogicalID]: permissionTemplate,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        permissionCFResource);
    });
  }
}

module.exports = AwsCompileS3Events;
