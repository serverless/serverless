'use strict';

const expect = require('chai').expect;
const AwsCompileFunctions = require('../awsCompileFunctions');
const Serverless = require('../../../Serverless');

describe('awsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;

  const functionsObjectMock = {
    first: {
      name_template: 'name-template-name',
      handler: 'first.function.handler',
      provider: {
        aws: {
          timeout: 6,
          memorySize: 1024,
          runtime: 'nodejs4.3',
        },
      },
    },
    second: {
      name_template: 'name-template-name',
      handler: 'second.function.handler',
      provider: {
        aws: {
          timeout: 6,
          memorySize: 1024,
          runtime: 'nodejs4.3',
        },
      },
    },
  };

  const serviceResourcesAwsResourcesObjectMock = {
    Resources: {
      first: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-dev-aws_useast1',
            S3Key: '',
          },
          FunctionName: 'new-service-first',
          Handler: 'first.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
      second: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-dev-aws_useast1',
            S3Key: '',
          },
          FunctionName: 'new-service-second',
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
    serverless.init();
    awsCompileFunctions = new AwsCompileFunctions(serverless);
    serverless.service.resources = { aws: { Resources: {} } };
    awsCompileFunctions.serverless.service.functions = functionsObjectMock;
    awsCompileFunctions.serverless.service.service = 'new-service';
  });

  describe('#compileFunctions()', () => {
    const options = { stage: 'dev', region: 'aws_useast1' };

    it('should throw an error if the stage option is not given', () => {
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should throw an error if the region option is not given', () => {
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should throw an error if the aws resource is not available', () => {
      awsCompileFunctions.serverless.service.resources.aws.Resources = false;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should create corresponding function resources', () => {
      awsCompileFunctions.compileFunctions(options);

      expect(
        JSON.stringify(awsCompileFunctions.serverless.service.resources.aws.Resources)
      ).to.equal(
        JSON.stringify(serviceResourcesAwsResourcesObjectMock.Resources)
      );
    });
  });
});
