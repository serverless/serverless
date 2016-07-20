'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const OpenWhiskRemove = require('../index');
const ClientFactory = require('../../util/client_factory');
const Serverless = require('../../../../Serverless');
const chaiAsPromised = require('chai-as-promised');

require('chai').use(chaiAsPromised);

describe('OpenWhiskRemove', () => {
  const serverless = new Serverless();

  let openwhiskRemove;
  let sandbox;

  const mockFunctionObject = {
    actionName: 'serviceName_functionName',
    namespace: 'namespace',
  };

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskRemove = new OpenWhiskRemove(serverless, options);
    openwhiskRemove.serverless.cli = new serverless.classes.CLI();
    openwhiskRemove.serverless.service.service = 'helloworld';
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#removeFunction()', () => {
    it('should call removeFunctionHandler with default params', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeFunctionHandler', () => Promise.resolve());
      const retValue = { name: 'name', namespace: 'namespace' };
      sandbox.stub(openwhiskRemove.serverless.service, 'getFunction', () => retValue);
      const functionName = 'testing';

      return openwhiskRemove.removeFunction(functionName).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith({ actionName: 'name', namespace: 'namespace' })).to.be.equal(true);
      });
    });

    it('should call removeFunctionHandler without functionObject name or namespace', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeFunctionHandler', () => Promise.resolve());
      const nothing = {};
      sandbox.stub(openwhiskRemove.serverless.service, 'getFunction', () => nothing);
      const functionName = 'testing';

      return openwhiskRemove.removeFunction(functionName).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith({ actionName: 'helloworld_testing' })).to.be.equal(true);
      });
    });
  });

  describe('#removeFunctionHandler()', () => {
    it('should remove function handler from openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const stub = params => {
          expect(params).to.be.deep.equal({
            actionName: mockFunctionObject.actionName,
            namespace: mockFunctionObject.namespace,
          });
          return Promise.resolve();
        };

        return Promise.resolve({ actions: { delete: stub } });
      });
      return expect(openwhiskRemove.removeFunctionHandler(mockFunctionObject))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to be removed with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => Promise.resolve(
        { actions: { delete: () => Promise.reject(err) } }
      ));
      return expect(openwhiskRemove.removeFunctionHandler(mockFunctionObject))
        .to.eventually.be.rejectedWith(
          new RegExp(`${mockFunctionObject.actionName}.*${err.message}`)
        );
    });
  });
});
