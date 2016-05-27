'use strict';

/**
 * Test: AwsCompileFunctionsToResources Plugin
 */

const expect = require('chai').expect;
const AwsCompileFunctionsToResources = require('../awsCompileFunctionsToResources');
const Serverless = require('../../../Serverless');

describe('CompileFunctionsToResources', () => {
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
});
