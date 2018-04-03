'use strict';

const _ = require('lodash');

class AwsCompileS3Events {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileS3Events.bind(this),
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
            let filter = {};

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
              if (event.s3.rules) {
                if (!_.isArray(event.s3.rules)) {
                  const errorMessage = [
                    `S3 filter rules of function ${functionName} is not an array`,
                    ' The correct syntax is: rules: [{ Name: Value }]',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
                const rules = [];
                event.s3.rules.forEach(rule => {
                  if (!_.isPlainObject(rule)) {
                    const errorMessage = [
                      `S3 filter rule ${rule} of function ${functionName} is not an object`,
                      ' The correct syntax is: { Name: Value }',
                      ' Please check the docs for more info.',
                    ].join('');
                    throw new this.serverless.classes
                      .Error(errorMessage);
                  }
                  const name = Object.keys(rule)[0];
                  const value = rule[name];
                  rules.push({ Name: name, Value: value });
                });
                filter = { Filter: { S3Key: { Rules: rules } } };
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

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);

            // check if the bucket already defined
            // in another S3 event in the service
            if (bucketsLambdaConfigurations[bucketName]) {
              let newLambdaConfiguration = {
                Event: notificationEvent,
                Function: {
                  'Fn::GetAtt': [
                    lambdaLogicalId,
                    'Arn',
                  ],
                },
              };

              // Assign 'filter' if not empty
              newLambdaConfiguration = _.assign(
                newLambdaConfiguration,
                filter
              );
              bucketsLambdaConfigurations[bucketName]
                .push(newLambdaConfiguration);
            } else {
              bucketsLambdaConfigurations[bucketName] = [
                {
                  Event: notificationEvent,
                  Function: {
                    'Fn::GetAtt': [
                      lambdaLogicalId,
                      'Arn',
                    ],
                  },
                },
              ];
              // Assign 'filter' if not empty
              bucketsLambdaConfigurations[bucketName][0] = _.assign(
                bucketsLambdaConfigurations[bucketName][0],
                filter
              );
            }
            const s3EnabledFunction = { functionName, bucketName };
            s3EnabledFunctions.push(s3EnabledFunction);
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
        DependsOn: [],
      };

      // create the DependsOn properties for the buckets permissions (which are created later on)
      const dependsOnToCreate = s3EnabledFunctions
        .filter(func => func.bucketName === bucketName);

      _.forEach(dependsOnToCreate, (item) => {
        const lambdaPermissionLogicalId = this.provider.naming
          .getLambdaS3PermissionLogicalId(item.functionName,
          item.bucketName);

        bucketTemplate.DependsOn.push(lambdaPermissionLogicalId);
      });

      const bucketLogicalId = this.provider.naming
        .getBucketLogicalId(bucketName);
      const bucketCFResource = {
        [bucketLogicalId]: bucketTemplate,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        bucketCFResource);
    });

    // iterate over all functions with S3 events
    // and give S3 permission to invoke them all
    // by adding Lambda::Permission resource for each
    s3EnabledFunctions.forEach(s3EnabledFunction => {
      const lambdaLogicalId = this.provider.naming
        .getLambdaLogicalId(s3EnabledFunction.functionName);
      const permissionTemplate = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': [
              lambdaLogicalId,
              'Arn',
            ],
          },
          Action: 'lambda:InvokeFunction',
          Principal: { 'Fn::Join': ['', ['s3.', { Ref: 'AWS::URLSuffix' }]] },
          SourceArn: {
            'Fn::Join': ['',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                `:s3:::${s3EnabledFunction.bucketName}`,
              ],
            ],
          },
        },
      };
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaS3PermissionLogicalId(s3EnabledFunction.functionName,
        s3EnabledFunction.bucketName);
      const permissionCFResource = {
        [lambdaPermissionLogicalId]: permissionTemplate,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        permissionCFResource);
    });
  }
}

module.exports = AwsCompileS3Events;
