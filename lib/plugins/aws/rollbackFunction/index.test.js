'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Serverless = require('../../../Serverless');
const AwsProvider = require('../provider/awsProvider');
const CLI = require('../../../classes/CLI');
const proxyquire = require('proxyquire');

describe('AwsRollbackFunction', () => {
  let serverless;
  let awsRollbackFunction;
  let consoleLogStub;
  let fetchStub;
  let AwsRollbackFunction;

  beforeEach(() => {
    fetchStub = sinon.stub().resolves({ buffer: () => {} });
    AwsRollbackFunction = proxyquire('./index.js', {
      'node-fetch': fetchStub,
    });
    serverless = new Serverless();
    serverless.servicePath = true;
    serverless.service.functions = {
      hello: {
        handler: true,
        name: 'service-dev-hello',
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'hello',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = new CLI(serverless);
    awsRollbackFunction = new AwsRollbackFunction(serverless, options);
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
  });

  describe('#constructor()', () => {
    let validateStub;
    let getFunctionToBeRestoredStub;
    let fetchFunctionCodeStub;
    let restoreFunctionStub;

    beforeEach(() => {
      validateStub = sinon
        .stub(awsRollbackFunction, 'validate').resolves();
      getFunctionToBeRestoredStub = sinon
        .stub(awsRollbackFunction, 'getFunctionToBeRestored').resolves();
      fetchFunctionCodeStub = sinon
        .stub(awsRollbackFunction, 'fetchFunctionCode').resolves();
      restoreFunctionStub = sinon
        .stub(awsRollbackFunction, 'restoreFunction').resolves();
    });

    afterEach(() => {
      awsRollbackFunction.validate.restore();
      awsRollbackFunction.getFunctionToBeRestored.restore();
      awsRollbackFunction.fetchFunctionCode.restore();
      awsRollbackFunction.restoreFunction.restore();
    });

    it('should have hooks', () => expect(awsRollbackFunction.hooks).to.be.not.empty);

    it('should have commands', () => expect(awsRollbackFunction.commands).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsRollbackFunction.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsRollbackFunctionWithEmptyOptions = new AwsRollbackFunction(serverless);
      expect(awsRollbackFunctionWithEmptyOptions.options).to.deep.equal({});
    });

    it('should run promise chain in order', () => awsRollbackFunction
      .hooks['rollback:function:rollback']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getFunctionToBeRestoredStub.calledAfter(validateStub)).to.equal(true);
        expect(fetchFunctionCodeStub.calledAfter(getFunctionToBeRestoredStub)).to.equal(true);
        expect(restoreFunctionStub.calledAfter(fetchFunctionCodeStub)).to.equal(true);
      })
    );
  });

  describe('#getFunctionToBeRestored()', () => {
    describe('when function and version can be found', () => {
      let getFunctionStub;

      beforeEach(() => {
        getFunctionStub = sinon
          .stub(awsRollbackFunction.provider, 'request')
          .resolves({ function: 'hello' });
      });

      afterEach(() => {
        awsRollbackFunction.provider.request.restore();
      });

      it('should return the requested function', () => {
        awsRollbackFunction.options.function = 'hello';
        awsRollbackFunction.options.version = '4711';

        return awsRollbackFunction.getFunctionToBeRestored().then((result) => {
          expect(getFunctionStub.calledOnce).to.equal(true);
          expect(getFunctionStub.calledWithExactly(
            'Lambda',
            'getFunction',
            {
              FunctionName: 'service-dev-hello',
              Qualifier: '4711',
            }
          )).to.equal(true);
          expect(consoleLogStub.called).to.equal(true);
          expect(result).to.deep.equal({ function: 'hello' });
        });
      });
    });

    describe('when function or version could not be found', () => {
      let getFunctionStub;

      beforeEach(() => {
        getFunctionStub = sinon
          .stub(awsRollbackFunction.provider, 'request')
          .rejects(new Error('function hello not found'));
      });

      afterEach(() => {
        awsRollbackFunction.provider.request.restore();
      });

      it('should translate the error message to a custom error message', () => {
        awsRollbackFunction.options.function = 'hello';
        awsRollbackFunction.options.version = '4711';

        return awsRollbackFunction.getFunctionToBeRestored().catch((error) => {
          expect(error.message.match(/Function "hello" with version "4711" not found/));
          expect(getFunctionStub.calledOnce).to.equal(true);
          expect(getFunctionStub.calledWithExactly(
            'Lambda',
            'getFunction',
            {
              FunctionName: 'service-dev-hello',
              Qualifier: '4711',
            }
          )).to.equal(true);
          expect(consoleLogStub.called).to.equal(true);
        });
      });
    });

    describe('when other error occurred', () => {
      let getFunctionStub;

      beforeEach(() => {
        getFunctionStub = sinon
          .stub(awsRollbackFunction.provider, 'request')
          .rejects(new Error('something went wrong'));
      });

      afterEach(() => {
        awsRollbackFunction.provider.request.restore();
      });

      it('should re-throw the error without translating it to a custom error message', () => {
        awsRollbackFunction.options.function = 'hello';
        awsRollbackFunction.options.version = '4711';

        return awsRollbackFunction.getFunctionToBeRestored().catch((error) => {
          expect(error.message.match(/something went wrong/));
          expect(getFunctionStub.calledOnce).to.equal(true);
          expect(getFunctionStub.calledWithExactly(
            'Lambda',
            'getFunction',
            {
              FunctionName: 'service-dev-hello',
              Qualifier: '4711',
            }
          )).to.equal(true);
          expect(consoleLogStub.called).to.equal(true);
        });
      });
    });
  });

  describe('#fetchFunctionCode()', () => {
    it('should fetch the zip file content of the previously requested function', () => {
      const func = {
        Code: {
          Location: 'https://foo.com/bar',
        },
      };

      return awsRollbackFunction.fetchFunctionCode(func).then(() => {
        expect(fetchStub.called).to.equal(true);
      });
    });
  });

  describe('#restoreFunction()', () => {
    let updateFunctionCodeStub;

    beforeEach(() => {
      updateFunctionCodeStub = sinon
        .stub(awsRollbackFunction.provider, 'request').resolves();
    });

    afterEach(() => {
      awsRollbackFunction.provider.request.restore();
    });

    it('should restore the provided function', () => {
      awsRollbackFunction.options.function = 'hello';
      const zipBuffer = new Buffer('');

      return awsRollbackFunction.restoreFunction(zipBuffer).then(() => {
        expect(updateFunctionCodeStub.calledOnce).to.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'service-dev-hello',
            ZipFile: zipBuffer,
          }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
      });
    });
  });
});
