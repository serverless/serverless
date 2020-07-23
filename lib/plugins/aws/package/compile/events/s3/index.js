'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const { addCustomResourceToService } = require('../../../../customResources');

class AwsCompileS3Events {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.allowedBucketProperties = new Set([
      'accelerateConfiguration',
      'accessControl',
      'analyticsConfigurations',
      'bucketEncryption',
      'bucketName',
      'corsConfiguration',
      'inventoryConfigurations',
      'lifecycleConfiguration',
      'loggingConfiguration',
      'metricsConfigurations',
      'notificationConfiguration',
      'objectLockConfiguration',
      'objectLockEnabled',
      'publicAccessBlockConfiguration',
      'replicationConfiguration',
      'tags',
      'versioningConfiguration',
      'websiteConfiguration',
    ]);

    this.hooks = {
      'package:compileEvents': () => {
        return BbPromise.bind(this)
          .then(this.newS3Buckets)
          .then(this.existingS3Buckets);
      },
    };
  }

  newS3Buckets() {
    const bucketsLambdaConfigurations = {};
    const bucketsMeta = {};
    const s3EnabledFunctions = [];
    const provderS3 = this.serverless.service.provider.s3 || {};
    const errorMessageBucketSyntax =
      'The correct syntax is: "s3: bucketName or bucketRef or an object with "bucket" property.';

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.s3) {
            // return immediately if it's an existing S3 event since we treat them differently
            if (event.s3.existing) return null;

            let bucketRef;
            let notificationEvent = 's3:ObjectCreated:*';
            let filter = {};

            if (typeof event.s3 === 'object') {
              if (!event.s3.bucket) {
                const errorMessage = [
                  `Missing "bucket" property for s3 event in function ${functionName}.`,
                  errorMessageBucketSyntax,
                  'Please check the docs for more info.',
                ].join(' ');
                throw new this.serverless.classes.Error(errorMessage);
              }
              bucketRef = event.s3.bucket;
              if (event.s3.event) {
                notificationEvent = event.s3.event;
              }
              if (event.s3.rules) {
                if (!Array.isArray(event.s3.rules)) {
                  const errorMessage = [
                    `S3 filter rules of function ${functionName} is not an array`,
                    ' The correct syntax is: rules: [{ Name: Value }]',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes.Error(errorMessage);
                }
                const rules = [];
                event.s3.rules.forEach(rule => {
                  if (!_.isPlainObject(rule)) {
                    const errorMessage = [
                      `S3 filter rule ${rule} of function ${functionName} is not an object`,
                      ' The correct syntax is: { Name: Value }',
                      ' Please check the docs for more info.',
                    ].join('');
                    throw new this.serverless.classes.Error(errorMessage);
                  }
                  const name = Object.keys(rule)[0];
                  const value = rule[name];
                  rules.push({ Name: name, Value: value });
                });
                filter = { Filter: { S3Key: { Rules: rules } } };
              }
            } else if (typeof event.s3 === 'string') {
              bucketRef = event.s3;
            } else {
              const errorMessage = [
                `S3 event of function ${functionName} is not an object nor a string.`,
                errorMessageBucketSyntax,
                'Please check the docs for more info.',
              ].join(' ');
              throw new this.serverless.classes.Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            let bucketName;
            if (provderS3[bucketRef]) {
              bucketName = provderS3[bucketRef].name || bucketRef;
              const logicalId = this.provider.naming.getBucketLogicalId(bucketRef);
              bucketsMeta[bucketName] = { logicalId, bucketRef };
            } else {
              bucketName = bucketRef;
            }

            if (/[A-Z]/.test(bucketName)) {
              const errorMessage = [
                `${bucketName} - Bucket name should not contain uppercase characters.`,
                `Please check provider.s3.${bucketRef} and/or s3 events of function "${functionName}".`,
              ].join(' ');
              throw new this.serverless.classes.Error(errorMessage);
            }

            if (bucketsLambdaConfigurations[bucketName]) {
              // check if the bucket already defined
              // in another S3 event in the service
              let newLambdaConfiguration = {
                Event: notificationEvent,
                Function: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
              };

              // Assign 'filter' if not empty
              newLambdaConfiguration = Object.assign(newLambdaConfiguration, filter);
              bucketsLambdaConfigurations[bucketName].push(newLambdaConfiguration);
            } else {
              bucketsLambdaConfigurations[bucketName] = [
                {
                  Event: notificationEvent,
                  Function: {
                    'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                  },
                },
              ];
              // Assign 'filter' if not empty
              bucketsLambdaConfigurations[bucketName][0] = Object.assign(
                bucketsLambdaConfigurations[bucketName][0],
                filter
              );
            }
            const s3EnabledFunction = { functionName, bucketName };
            s3EnabledFunctions.push(s3EnabledFunction);
          }

          return null;
        });
      }
    });

    // iterate over all buckets to be created
    // and compile them to CF resources
    _.forEach(bucketsLambdaConfigurations, (bucketLambdaConfiguration, bucketName) => {
      let bucketConf = null;
      if (bucketsMeta[bucketName]) {
        const providerBucket = provderS3[bucketsMeta[bucketName].bucketRef];
        bucketConf = {};
        for (const [key, value] of _.entries(providerBucket)) {
          if (key !== 'name') {
            if (!this.allowedBucketProperties.has(key)) {
              const errorMessage = [
                `"${key}" is not a valid bucket property.`,
                'A bucket could only be configured with the following properties:\n',
                ['name'].concat(Array.from(this.allowedBucketProperties)).join(', '),
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }
            const property = _.upperFirst(key);
            bucketConf[property] = value;
          }
        }
      }
      let providedNotificationConfiguration = {};
      if (bucketConf && Object.keys(bucketConf).length > 0) {
        providedNotificationConfiguration = bucketConf.NotificationConfiguration;
        delete bucketConf.NotificationConfiguration;
      }

      const bucketTemplate = {
        Type: 'AWS::S3::Bucket',
        Properties: Object.assign(
          {
            BucketName: bucketName,
            NotificationConfiguration: Object.assign(
              {
                LambdaConfigurations: bucketLambdaConfiguration,
              },
              providedNotificationConfiguration
            ),
          },
          bucketConf
        ),
        DependsOn: [],
      };

      // create the DependsOn properties for the buckets permissions (which are created later on)
      const dependsOnToCreate = s3EnabledFunctions.filter(func => func.bucketName === bucketName);

      dependsOnToCreate.forEach(item => {
        const lambdaPermissionLogicalId = this.provider.naming.getLambdaS3PermissionLogicalId(
          item.functionName,
          (bucketsMeta[item.bucketName] && bucketsMeta[item.bucketName].bucketRef) ||
            item.bucketName
        );

        bucketTemplate.DependsOn.push(lambdaPermissionLogicalId);
      });

      const bucketLogicalId =
        (bucketsMeta[bucketName] && bucketsMeta[bucketName].logicalId) ||
        this.provider.naming.getBucketLogicalId(bucketName);
      const bucketCFResource = {
        [bucketLogicalId]: bucketTemplate,
      };
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        bucketCFResource
      );
    });

    // iterate over all functions with S3 events
    // and give S3 permission to invoke them all
    // by adding Lambda::Permission resource for each
    s3EnabledFunctions.forEach(s3EnabledFunction => {
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(
        s3EnabledFunction.functionName
      );
      const permissionTemplate = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 's3.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '',
              ['arn:', { Ref: 'AWS::Partition' }, `:s3:::${s3EnabledFunction.bucketName}`],
            ],
          },
          SourceAccount: { Ref: 'AWS::AccountId' },
        },
      };
      const lambdaPermissionLogicalId = this.provider.naming.getLambdaS3PermissionLogicalId(
        s3EnabledFunction.functionName,
        (bucketsMeta[s3EnabledFunction.bucketName] &&
          bucketsMeta[s3EnabledFunction.bucketName].bucketRef) ||
          s3EnabledFunction.bucketName
      );
      const permissionCFResource = {
        [lambdaPermissionLogicalId]: permissionTemplate,
      };
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        permissionCFResource
      );
    });
  }

  existingS3Buckets() {
    const { service } = this.serverless;
    const { provider } = service;
    const { compiledCloudFormationTemplate } = provider;
    const { Resources } = compiledCloudFormationTemplate;
    const iamRoleStatements = [];

    // used to keep track of the custom resources created for each bucket
    const bucketResources = {};

    service.getAllFunctions().forEach(functionName => {
      let numEventsForFunc = 0;
      let currentBucketName = null;
      let funcUsesExistingS3Bucket = false;
      const functionObj = service.getFunction(functionName);
      const FunctionName = functionObj.name;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.s3 && _.isObject(event.s3) && event.s3.existing) {
            numEventsForFunc++;
            let rules = null;
            const bucket = event.s3.bucket;
            const notificationEvent = event.s3.event || 's3:ObjectCreated:*';
            funcUsesExistingS3Bucket = true;

            if (!currentBucketName) {
              currentBucketName = bucket;
            }
            if (bucket !== currentBucketName) {
              const errorMessage = [
                'Only one S3 Bucket can be configured per function.',
                ` In "${FunctionName}" you're attempting to configure "${currentBucketName}" and "${bucket}" at the same time.`,
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }

            rules = (event.s3.rules || []).map(rule => {
              const key = Object.keys(rule)[0];
              const value = rule[key];
              return {
                [_.startCase(key)]: value,
              };
            });

            const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const customResourceFunctionLogicalId = this.provider.naming.getCustomResourceS3HandlerFunctionLogicalId();
            const customS3ResourceLogicalId = this.provider.naming.getCustomResourceS3ResourceLogicalId(
              functionName
            );

            // store how often the custom S3 resource is used
            if (bucketResources[bucket]) {
              bucketResources[bucket] = _.union(bucketResources[bucket], [
                customS3ResourceLogicalId,
              ]);
            } else {
              Object.assign(bucketResources, {
                [bucket]: [customS3ResourceLogicalId],
              });
            }

            let customS3Resource;
            if (numEventsForFunc === 1) {
              customS3Resource = {
                [customS3ResourceLogicalId]: {
                  Type: 'Custom::S3',
                  Version: 1.0,
                  DependsOn: [eventFunctionLogicalId, customResourceFunctionLogicalId],
                  Properties: {
                    ServiceToken: {
                      'Fn::GetAtt': [customResourceFunctionLogicalId, 'Arn'],
                    },
                    FunctionName,
                    BucketName: bucket,
                    BucketConfigs: [
                      {
                        Event: notificationEvent,
                        Rules: rules,
                      },
                    ],
                  },
                },
              };

              iamRoleStatements.push({
                Effect: 'Allow',
                Resource: {
                  'Fn::Join': [':', ['arn', { Ref: 'AWS::Partition' }, 's3', '', '', bucket]],
                },
                Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
              });
            } else {
              Resources[customS3ResourceLogicalId].Properties.BucketConfigs.push({
                Event: notificationEvent,
                Rules: rules,
              });
            }

            _.merge(Resources, customS3Resource);
          }
        });
      }

      if (funcUsesExistingS3Bucket) {
        iamRoleStatements.push({
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              ':',
              [
                'arn',
                { Ref: 'AWS::Partition' },
                'lambda',
                { Ref: 'AWS::Region' },
                { Ref: 'AWS::AccountId' },
                'function',
                FunctionName,
              ],
            ],
          },
          Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
        });
      }
    });

    // check if we need to add DependsOn clauses in case more than 1
    // custom resources are created for one bucket (to avoid race conditions)
    if (Object.keys(bucketResources).length > 0) {
      Object.keys(bucketResources).forEach(bucket => {
        const resources = bucketResources[bucket];
        if (resources.length > 1) {
          resources.forEach((currResourceLogicalId, idx) => {
            if (idx > 0) {
              const prevResourceLogicalId = resources[idx - 1];
              Resources[currResourceLogicalId].DependsOn.push(prevResourceLogicalId);
            }
          });
        }
      });
    }

    if (iamRoleStatements.length) {
      return addCustomResourceToService(this.provider, 's3', iamRoleStatements);
    }

    return null;
  }
}

module.exports = AwsCompileS3Events;
