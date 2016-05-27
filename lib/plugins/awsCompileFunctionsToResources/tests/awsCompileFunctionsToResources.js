'use strict';

/**
 * Test: AwsCompileFunctionsToResources Plugin
 */

const expect = require('chai').expect;
const AwsCompileFunctionsToResources = require('../awsCompileFunctionsToResources');
const Serverless = require('../../../Serverless');

describe('AwsCompileFunctionsToResources', () => {
  let awsCompileFunctionsToResources;
  let serverless;

  const rawFunctionsMock = {
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
          Code: '',
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
          Code: '',
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

  beforeEach(() => {
    serverless = new Serverless();
    awsCompileFunctionsToResources = new AwsCompileFunctionsToResources(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () =>
      expect(awsCompileFunctionsToResources.serverless).to.equal(serverless)
    );

    it('should have an empty options object', () => {
      expect(awsCompileFunctionsToResources.options).to.deep.equal({});
    });

    it('should have an empty functions array', () => {
      expect(awsCompileFunctionsToResources.functions.length).to.equal(0);
    });

    it('should have an empty functionResources array', () => {
      expect(awsCompileFunctionsToResources.functionResources.length).to.equal(0);
    });

    it('should have a hook', () => {
      expect(awsCompileFunctionsToResources.hooks).to.not.deep.equal({});
    });
  });

  describe('#validateOptions()', () => {
    it('should throw an error if the stage is not set', () => {
      awsCompileFunctionsToResources.options.stage = '';
      expect(() => awsCompileFunctionsToResources.validateOptions()).to.throw(Error);
    });

    it('should throw an error if the region is not set', () => {
      awsCompileFunctionsToResources.options.region = '';
      expect(() => awsCompileFunctionsToResources.validateOptions()).to.throw(Error);
    });
  });

  describe('#extractFunctions()', () => {
    it('should extract functions from a functions object', () => {
      serverless.service.functions = rawFunctionsMock;

      return awsCompileFunctionsToResources.extractFunctions().then(() => {
        expect(awsCompileFunctionsToResources.functions[0].first).to.equal(
          rawFunctionsMock.first
        );
        expect(awsCompileFunctionsToResources.functions[1].second).to.equal(
          rawFunctionsMock.second
        );
      });
    });
  });

  describe('#createFunctionResources()', () => {
    it('should create corresponding function resources', () => {
      awsCompileFunctionsToResources.serverless.service.environment = {
        vars: {
          iamRoleArnLambda: 'roleMock',
        },
      };
      awsCompileFunctionsToResources.functions = functionsArrayMock;

      return awsCompileFunctionsToResources.createFunctionResources().then(() => {
        expect(
          JSON.stringify(awsCompileFunctionsToResources.functionResources[0])
        ).to.equal(
          JSON.stringify(functionResourcesArrayMock[0])
        );
        expect(
          JSON.stringify(awsCompileFunctionsToResources.functionResources[1])
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
    });

    it('should throw an error if the role is not defined', () => {
      // just a normal function. The role is not set beforehand
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
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

      awsCompileFunctionsToResources.functions = badFunctionsArrayMock;

      expect(() => awsCompileFunctionsToResources.createFunctionResources()).to.throw(Error);
    });
  });

  describe('#addFunctionResourcesToServiceResourcesObject()', () => {
    it('should extend an existing aws service resource definition if available', () => {
      awsCompileFunctionsToResources.serverless.service.resources = { aws: { Resources: {} } };
      awsCompileFunctionsToResources.functionResources = functionResourcesArrayMock;

      return awsCompileFunctionsToResources
        .addFunctionResourcesToServiceResourcesObject().then(() => {
          expect(
            Object.keys(
              awsCompileFunctionsToResources.serverless.service.resources.aws.Resources
            )[0]
          ).to.equal('firstLambda');

          expect(
            Object.keys(
              awsCompileFunctionsToResources.serverless.service.resources.aws.Resources
            )[1]
          ).to.equal('secondLambda');
        });
    });

    it('should create a new aws service resource if not yet available', () => {
      awsCompileFunctionsToResources.serverless.service.resources = {};
      awsCompileFunctionsToResources.functionResources = functionResourcesArrayMock;

      return awsCompileFunctionsToResources
        .addFunctionResourcesToServiceResourcesObject().then(() => {
          expect(awsCompileFunctionsToResources.serverless.service.resources.aws)
            .to.not.be.empty;
        });
    });
  });
});
