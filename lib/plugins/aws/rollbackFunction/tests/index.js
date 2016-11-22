'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');

const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');
const BbPromise = require('bluebird');
const AwsRollbackFunction = require('../index');

describe('Aws', () => {
  let serverless;
  let awsRollbackFunction;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.servicePath = true;
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };
    serverless.service.functions = {
      hello: {
        handler: true,
        name: 'aws-nodejs-dev-hello',
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'hello',
    };
    serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsRollbackFunction = new AwsRollbackFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsRollbackFunction.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsRollbackFunction.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsRollbackFunctionWithEmptyOptions = new AwsRollbackFunction(serverless);
      expect(awsRollbackFunctionWithEmptyOptions.options).to.deep.equal({});
    });

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsRollbackFunction, 'validate').returns(BbPromise.resolve());
      const getPreviousFunctionStub = sinon
        .stub(awsRollbackFunction, 'getPreviousFunction').returns(BbPromise.resolve());
      const restoreFunctionStub = sinon
        .stub(awsRollbackFunction, 'restoreFunction').returns(BbPromise.resolve());

      return awsRollbackFunction.hooks['rollback:function:rollback']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPreviousFunctionStub.calledAfter(validateStub))
          .to.equal(true);
        expect(restoreFunctionStub.calledAfter(getPreviousFunctionStub))
          .to.equal(true);

        awsRollbackFunction.getPreviousFunction.restore();
        awsRollbackFunction.restoreFunction.restore();
      });
    });
  });

  describe('getPreviousFunction()', () => {
    it('should get the previous function', () => {
      const getFunctionStub = sinon
        .stub(awsRollbackFunction.provider, 'request').returns(BbPromise.resolve());

      return awsRollbackFunction.getPreviousFunction().then(() => {
        expect(getFunctionStub.calledOnce).to.be.equal(true);
        expect(getFunctionStub.calledWithExactly(
          'Lambda',
          'getFunction',
          {
            FunctionName: 'aws-nodejs-dev-hello',
            Qualifier: 'aws-nodejs-dev-hello-rollback',
          },
          awsRollbackFunction.options.stage,
          awsRollbackFunction.options.region
        )).to.be.equal(true);
        awsRollbackFunction.provider.request.restore();
      });
    });
  });

  describe('restoreFunction()', () => {
    it('should restore the function', () => {
      const requestStub = sinon
        .stub(awsRollbackFunction, 'request').callsArgWith(1, null, null, 'foo');

      const updateFunctionCodeStub = sinon
        .stub(awsRollbackFunction.provider, 'request').returns(BbPromise.resolve());

      awsRollbackFunction.previousFunc = {
        Configuration: {
          CodeSize: 1024,
        },
        Code: {
          Location: 'http://example.com',
        },
      };

      return awsRollbackFunction.restoreFunction().then(() => {
        expect(requestStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'aws-nodejs-dev-hello',
            ZipFile: 'foo',
          },
          awsRollbackFunction.options.stage,
          awsRollbackFunction.options.region
        )).to.be.equal(true);
        awsRollbackFunction.provider.request.restore();
      });
    });
  });
});
