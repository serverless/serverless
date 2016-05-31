'use strict';

const expect = require('chai').expect;
const compile = require('../lib/compile');
const Serverless = require('../../../Serverless');

describe('compile', () => {
  let serverless;
  let awsDeployMock;

  const rawFunctionObjectsMock = {
    name_template: 'name-template-name',
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
    second: {
      name_template: 'name-template-name',
      handler: 'second.function.handler',
      provider: {
        aws_lambda: {
          timeout: 6,
          memorySize: 1024,
          runtime: 'nodejs4.3',
        },
      },
    },
  };

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
    {
      second: {
        name_template: 'name-template-name',
        handler: 'second.function.handler',
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

  const functionResourcesArrayMock = [
    {
      firstLambda: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: 'https://path-to-s3-upload/first.zip',
          FunctionName: 'first',
          Handler: 'first.function.handler',
          MemorySize: 1024,
          Role: 'roleMock',
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
    },
    {
      secondLambda: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: 'https://path-to-s3-upload/second.zip',
          FunctionName: 'second',
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
      Object.assign(this, compile);
      this.options = {};
      this.serverless = serverless;
      this.functionObjects = [];
      this.functionResources = [];
    }
  }

  beforeEach(() => {
    serverless = new Serverless();
    awsDeployMock = new AwsDeployMock(serverless);
    awsDeployMock.deployedFunctions = deployedFunctionsArrayMock;
  });

  describe('#validateForCompile()', () => {
    it('should throw an error if the stage is not set', () => {
      awsDeployMock.options.stage = '';
      expect(() => awsDeployMock.validateForCompile().to.throw(Error));
    });

    it('should throw an error if the region is not set', () => {
      awsDeployMock.options.region = '';
      expect(() => awsDeployMock.validateForCompile().to.throw(Error));
    });
  });

  describe('#extractFunctions()', () => {
    it('should extract functions from the rawFunctions object', () => {
      serverless.service.functions = rawFunctionObjectsMock;

      return compile.extractFunctions.apply(awsDeployMock).then(() => {
        expect(awsDeployMock.functionObjects[0].first).to.equal(rawFunctionObjectsMock.first);
        expect(awsDeployMock.functionObjects[1].second).to.equal(rawFunctionObjectsMock.second);
      });
    });
  });

  describe('#createFunctionResources', () => {
    it('should create corresponding function resources', () => {
      awsDeployMock.serverless.service.environment = {
        stages: {
          dev: {
            regions: {
              aws_useast_1: {
                vars: {
                  iamRoleArnLambda: 'roleMock',
                },
              },
            },
          },
        },
      };
      awsDeployMock.options.stage = 'dev';
      awsDeployMock.options.region = 'aws_useast_1';
      awsDeployMock.functions = functionsArrayMock;

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
          ).to.equal('firstLambda');

          expect(
            Object.keys(
              awsDeployMock.serverless.service.resources.aws.Resources
            )[1]
          ).to.equal('secondLambda');
        });
    });

    it('should create a new aws service resource if not yet available', () => {
      awsDeployMock.serverless.service.resources = {};
      awsDeployMock.functionResources = functionResourcesArrayMock;

      return awsDeployMock
        .addFunctionResourcesToServiceResourcesObject().then(() => {
          expect(awsDeployMock.serverless.service.resources.aws)
            .to.not.be.empty;
        });
    });
  });
});
