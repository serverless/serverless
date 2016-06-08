'use strict';

const expect = require('chai').expect;
const AwsCompileS3Events = require('../awsCompileS3Events');
const Serverless = require('../../../Serverless');

describe('awsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;

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

  const compiledS3EventResourcesArrayMock = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ];

  const compiledPermissionResourcesArrayMock = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
  ];

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    awsCompileS3Events = new AwsCompileS3Events(serverless);
    awsCompileS3Events.serverless.service.service = 'new-service';
    awsCompileS3Events.serverless.service.functions = functionsObjectMock;
  });

  describe('#compileS3Events()', () => {
    const options = { stage: 'dev', region: 'us-east-1' };

    it('should throw an error if the stage option is not given', () => {
      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should throw an error if the region option is not given', () => {
      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should create corresponding S3 bucket resources', () => {
      awsCompileS3Events.compileS3Events(options);

      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[0])
      ).to.equal(
        JSON.stringify(compiledS3EventResourcesArrayMock[0])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[2])
      ).to.equal(
        JSON.stringify(compiledS3EventResourcesArrayMock[1])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[4])
      ).to.equal(
        JSON.stringify(compiledS3EventResourcesArrayMock[2])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[6])
      ).to.equal(
        JSON.stringify(compiledS3EventResourcesArrayMock[3])
      );
    });

    it('should create corresponding permission resources', () => {
      awsCompileS3Events.compileS3Events(options);

      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[1])
      ).to.equal(
        JSON.stringify(compiledPermissionResourcesArrayMock[0])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[3])
      ).to.equal(
        JSON.stringify(compiledPermissionResourcesArrayMock[1])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[5])
      ).to.equal(
        JSON.stringify(compiledPermissionResourcesArrayMock[2])
      );
      expect(
        JSON.stringify(awsCompileS3Events.serverless.service.compiledS3EventResources[7])
      ).to.equal(
        JSON.stringify(compiledPermissionResourcesArrayMock[3])
      );
    });
  });
});
