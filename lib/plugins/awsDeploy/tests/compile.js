'use strict';

const expect = require('chai').expect;
const compile = require('../lib/compile');
const Serverless = require('../../../Serverless');

describe('compile', () => {
  let serverless;
  let awsDeployMock;

  beforeEach(() => {
    serverless = new Serverless();
    awsDeployMock = {
      serverless,
      functionObjects: [],
    };
  });

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

  describe('#extractFunctions()', () => {
    it('should extract functions from the rawFunctions object', () => {
      serverless.service.functions = rawFunctionObjectsMock;

      return compile.extractFunctions.apply(awsDeployMock).then(() => {
        expect(awsDeployMock.functionObjects[0].first).to.equal(rawFunctionObjectsMock.first);
        expect(awsDeployMock.functionObjects[1].second).to.equal(rawFunctionObjectsMock.second);
      });
    });
  });
});
