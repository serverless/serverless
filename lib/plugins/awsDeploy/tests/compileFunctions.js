'use strict';

const expect = require('chai').expect;
const compileFunctions = require('../lib/compileFunctions');
const Serverless = require('../../../Serverless');

describe('compileFunctions', () => {
  let serverless;
  let awsDeployMock;

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

  const functionResourcesArrayMock = [
    {
      first: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-aws_useast1',
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
            S3Bucket: 'new-service-aws_useast1',
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

  const deployedFunctionsArrayMock = [
    {
      name: 'first',
      handler: 'first.handler',
      zipFilePath: 'some/random/path/first.zip',
      s3FileUrl: 'https://path-to-s3-upload/first.zip',
    },
    {
      name: 'second',
      handler: 'second.handler',
      zipFilePath: 'some/random/path/second.zip',
      s3FileUrl: 'https://path-to-s3-upload/second.zip',
    },
  ];

  class AwsDeployMock {
    constructor(serverless) {
      Object.assign(this, compileFunctions);
      this.options = {};
      this.serverless = serverless;
      this.functionResources = [];
    }
  }

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    awsDeployMock = new AwsDeployMock(serverless);
    awsDeployMock.deployedFunctions = deployedFunctionsArrayMock;
  });

  describe('#createFunctionResources', () => {
    it('should create corresponding function resources', () => {
      awsDeployMock.serverless.service.environment = {
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
      awsDeployMock.options.stage = 'dev';
      awsDeployMock.options.region = 'aws_useast1';
      awsDeployMock.serverless.service.functions = functionsObjectMock;

      return awsDeployMock.createFunctionResources().then(() => {
        expect(
          JSON.stringify(awsDeployMock.functionResources[0])
        ).to.equal(
          JSON.stringify(functionResourcesArrayMock[0])
        );
        expect(
          JSON.stringify(awsDeployMock.functionResources[1])
        ).to.equal(
          JSON.stringify(functionResourcesArrayMock[1])
        );
      });
    });

    it('should throw an error if the functionName is not defined', () => {
      const badFunctionsArrayMock = [
        {
          '': {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: 1024,
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = badFunctionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the path to the zip file ("Code" property) is not defined', () => {
      // just a normal function. The role is not set beforehand
      const functionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: 1024,
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = functionsArrayMock;
      awsDeployMock.deployedFunctions[0].s3FileUrl = '';
      awsDeployMock.deployedFunctions[1].s3FileUrl = '';

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the handler is not defined', () => {
      const badFunctionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: '',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: 1024,
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = badFunctionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the memory size is not defined', () => {
      const badFunctionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: '',
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = badFunctionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the role is not defined', () => {
      // just a normal function. The role is not set beforehand
      const functionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: 1024,
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = functionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if runtime is not defined', () => {
      const badFunctionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: 6,
                memorySize: 1024,
                runtime: '',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = badFunctionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the timeout is not defined', () => {
      const badFunctionsArrayMock = [
        {
          first: {
            name_template: 'name-template-name',
            handler: 'first.function.handler',
            provider: {
              aws_lambda: {
                timeout: '',
                memorySize: 1024,
                runtime: 'nodejs4.3',
              },
            },
          },
        },
      ];

      awsDeployMock.functions = badFunctionsArrayMock;

      expect(() => awsDeployMock.createFunctionResources()).to.throw(Error);
    });
  });

  describe('#addFunctionResourcesToServiceResourcesObject()', () => {
    it('should extend an existing aws service resource definition if available', () => {
      awsDeployMock.serverless.service.resources = { aws: { Resources: {} } };
      awsDeployMock.functionResources = functionResourcesArrayMock;

      return awsDeployMock
        .addFunctionResourcesToServiceResourcesObject().then(() => {
          expect(
            Object.keys(
              awsDeployMock.serverless.service.resources.aws.Resources
            )[0]
          ).to.equal('first');

          expect(
            Object.keys(
              awsDeployMock.serverless.service.resources.aws.Resources
            )[1]
          ).to.equal('second');
        });
    });
  });
});
