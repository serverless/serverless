'use strict';

const expect = require('chai').expect;
const AwsCompileS3Events = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('awsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileS3Events = new AwsCompileS3Events(serverless);
    awsCompileS3Events.serverless.service.service = 'new-service';
  });

  describe('#compileS3Events()', () => {
    it('should throw an error if the aws resource is not available', () => {
      awsCompileS3Events.serverless.service.resources.Resources = false;
      expect(() => awsCompileS3Events.compileS3Events()).to.throw(Error);
    });

    it('should create corresponding resources when S3 events are simple strings', () => {
      const functionsObjectMock = {
        first: {
          events: [
            {
              s3: 'first-function-bucket',
            },
          ],
        },
      };

      const resourcesObjectMock = {
        Resources: {
          firstfunctionbucket0S3Event: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'first-function-bucket0',
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
          firstfunctionbucket0S3EventPermission: {
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
      };

      awsCompileS3Events.serverless.service.functions = functionsObjectMock;

      awsCompileS3Events.compileS3Events();

      expect(
        awsCompileS3Events.serverless.service.resources.Resources
      ).to.deep.equal(
        resourcesObjectMock.Resources
      );
    });

    it('should create corresponding resources when S3 events are given as objects', () => {
      const functionsObjectMock = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket',
                event: 's3:ObjectCreated:Put',
              },
            },
          ],
        },
      };

      const resourcesObjectMock = {
        Resources: {
          firstfunctionbucket0S3Event: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'first-function-bucket0',
              NotificationConfiguration: {
                LambdaConfigurations: [
                  {
                    Event: 's3:ObjectCreated:Put',
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
          firstfunctionbucket0S3EventPermission: {
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
      };

      awsCompileS3Events.serverless.service.functions = functionsObjectMock;

      awsCompileS3Events.compileS3Events();

      expect(
        awsCompileS3Events.serverless.service.resources.Resources
      ).to.deep.equal(
        resourcesObjectMock.Resources
      );
    });

    it('should not create corresponding resources when S3 events are not given', () => {
      const functionsObjectMock = {
        first: {
          events: {
          },
        },
      };

      const resourcesObjectMock = {
        Resources: {},
      };

      awsCompileS3Events.serverless.service.functions = functionsObjectMock;

      awsCompileS3Events.compileS3Events();

      expect(
        awsCompileS3Events.serverless.service.resources.Resources
      ).to.deep.equal(
        resourcesObjectMock.Resources
      );
    });
  });
});
