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

  const compiledFunctionResourcesArrayMock = [
    {
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
          Role: 'roleMock',
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
    },
    {
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
          Role: 'roleMock',
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
    },
  ];

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    awsCompileFunctions = new AwsCompileFunctions(serverless);
    awsCompileFunctions.serverless.service.functions = functionsObjectMock;
    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.resources.aws = {};
    awsCompileFunctions.serverless.service.environment = {
      stages: {
        dev: {
          regions: {
            'us-east-1': {
              vars: {
                iamRoleArnLambda: 'roleMock',
              },
            },
          },
        },
      },
    };
  });

  describe('#compileFunctions()', () => {
    it('should create corresponding function resources', () => {
      const options = { stage: 'dev', region: 'aws_useast1' };
      awsCompileFunctions.compileFunctions(options);

      expect(
        JSON.stringify(serverless.service.compiledFunctionResources[0])
      ).to.equal(
        JSON.stringify(compiledFunctionResourcesArrayMock[0])
      );
      expect(
        JSON.stringify(serverless.service.compiledFunctionResources[1])
      ).to.equal(
        JSON.stringify(compiledFunctionResourcesArrayMock[1])
      );
    });
  });
});
