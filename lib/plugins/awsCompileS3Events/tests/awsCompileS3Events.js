'use strict';

const expect = require('chai').expect;
const AwsCompileS3Events = require('../awsCompileS3Events');
const Serverless = require('../../../Serverless');

describe('awsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: { Resources: {} } };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileS3Events = new AwsCompileS3Events(serverless, options);
    awsCompileS3Events.serverless.service.service = 'new-service';
  });

  describe('#compileS3Events()', () => {
    it('should throw an error if the aws resource is not available', () => {
      awsCompileS3Events.serverless.service.resources.aws.Resources = false;
      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should create corresponding resources when S3 events given', () => {
      const functionsObjectMock = {
        first: {
          events: {
            aws: {
              s3: [
                'first-function-bucket1',
                'first-function-bucket2',
              ],
            },
          },
        },
        second: {
          events: {
            aws: {
              s3: [
                'second-function-bucket1',
                'second-function-bucket2',
              ],
            },
          },
        },
      };

      const serviceResourcesAwsResourcesObjectMock = {
        Resources: {
          firstfunctionbucket1: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'new-service-first-function-bucket1-dev-us-east-1',
              NotificationConfiguration: {
                LambdaConfigurations: [
                  {
                    Event: 's3:ObjectCreated:*',
                    Function: {
                      'Fn::GetAtt': [
                        'first',
                        'Arn',
                      ],
                    },
                  },
                ],
              },
            },
          },
          firstfunctionbucket1Permission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::GetAtt': [
                  'first',
                  'Arn',
                ],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 's3.amazonaws.com',
            },
          },

          firstfunctionbucket2: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'new-service-first-function-bucket2-dev-us-east-1',
              NotificationConfiguration: {
                LambdaConfigurations: [
                  {
                    Event: 's3:ObjectCreated:*',
                    Function: {
                      'Fn::GetAtt': [
                        'first',
                        'Arn',
                      ],
                    },
                  },
                ],
              },
            },
          },
          firstfunctionbucket2Permission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::GetAtt': [
                  'first',
                  'Arn',
                ],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 's3.amazonaws.com',
            },
          },

          secondfunctionbucket1: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'new-service-second-function-bucket1-dev-us-east-1',
              NotificationConfiguration: {
                LambdaConfigurations: [
                  {
                    Event: 's3:ObjectCreated:*',
                    Function: {
                      'Fn::GetAtt': [
                        'second',
                        'Arn',
                      ],
                    },
                  },
                ],
              },
            },
          },
          secondfunctionbucket1Permission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::GetAtt': [
                  'second',
                  'Arn',
                ],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 's3.amazonaws.com',
            },
          },

          secondfunctionbucket2: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'new-service-second-function-bucket2-dev-us-east-1',
              NotificationConfiguration: {
                LambdaConfigurations: [
                  {
                    Event: 's3:ObjectCreated:*',
                    Function: {
                      'Fn::GetAtt': [
                        'second',
                        'Arn',
                      ],
                    },
                  },
                ],
              },
            },
          },
          secondfunctionbucket2Permission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::GetAtt': [
                  'second',
                  'Arn',
                ],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 's3.amazonaws.com',
            },
          },
        },
      };

      awsCompileS3Events.serverless.service.functions = functionsObjectMock;

      awsCompileS3Events.compileS3Events();

      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.resources.aws.Resources)
      ).to.equal(
        JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources)
      );
    });

    it('should not create corresponding resources when S3 events not given', () => {
      const functionsObjectMock = {
        first: {
          events: {
            aws: {},
          },
        },
      };

      const serviceResourcesAwsResourcesObjectMock = {
        Resources: {},
      };

      awsCompileS3Events.serverless.service.functions = functionsObjectMock;

      awsCompileS3Events.compileS3Events();

      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.resources.aws.Resources)
      ).to.equal(
        JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources)
      );
    });
  });
});
