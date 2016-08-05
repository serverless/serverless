'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('deployFunctions', () => {
  let serverless;
  let awsDeploy;

  const functionsObjectMock = {
    name_template: 'name-template-name',
    first: {
      handler: 'first.function.handler',
    },
    second: {
      handler: 'second.function.handler',
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    awsDeploy = new AwsDeploy(serverless);
  });

  describe('#extractFunctionHandlers()', () => {
    beforeEach(() => {
      serverless.service.functions = functionsObjectMock;
    });

    it('should extract all the handlers in the function definitions', () => awsDeploy
      .extractFunctionHandlers().then(() => {
        expect(
          awsDeploy.deployedFunctions[0].handler
        ).to.equal(functionsObjectMock.first.handler);
        expect(
          awsDeploy.deployedFunctions[1].handler
        ).to.equal(functionsObjectMock.second.handler);
      })
    );
  });

  describe('#deployFunctions()', () => {
    it('should run promise chain in order', () => {
      const extractFunctionHandlersStub = sinon
        .stub(awsDeploy, 'extractFunctionHandlers').returns(BbPromise.resolve());

      return awsDeploy.deployFunctions().then(() => {
        expect(extractFunctionHandlersStub.calledOnce).to.be.equal(true);

        awsDeploy.extractFunctionHandlers.restore();
      });
    });
  });
});
