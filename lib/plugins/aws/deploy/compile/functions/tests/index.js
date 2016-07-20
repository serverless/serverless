'use strict';

const expect = require('chai').expect;
const AwsCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;

  const functionsObjectMock = {
    // function with overwritten config
    first: {
      name: 'customized-first-function',
      handler: 'first.function.handler',
      memory: 128,
      timeout: 10,
    },
    // function without overwritten config
    second: {
      handler: 'second.function.handler',
    },
  };

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      first: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'artifact.zip',
          },
          FunctionName: 'customized-first-function',
          Handler: 'first.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 10,
        },
      },
      second: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'artifact.zip',
          },
          FunctionName: 'new-service-dev-second',
          Handler: 'second.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileFunctions = new AwsCompileFunctions(serverless, options);
    serverless.service.resources = { Resources: {} };
    awsCompileFunctions.serverless.service.functions = functionsObjectMock;
    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.runtime = 'nodejs4.3';
    awsCompileFunctions.serverless.service.package.artifact = 'artifact.zip';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileFunctions.provider)
      .to.equal('aws'));
  });

  describe('#compileFunctions()', () => {
    it('should throw an error if the resource section is not available', () => {
      awsCompileFunctions.serverless.service.resources.Resources = false;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should create corresponding function resources', () => {
      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.resources.Resources
      ).to.deep.equal(
        serviceResourcesAwsResourcesObjectMock.Resources
      );
    });
  });
});
