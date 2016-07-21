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

  const mockTriggerObject = {
    triggerName: 'someTrigger',
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

  describe('#removeTrigger()', () => {
    it('should call removeTriggerHandler with default params', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeTriggerHandler', () => Promise.resolve());
      const triggers = { myTrigger: {} };
      openwhiskRemove.serverless.service.resources = { triggers };
      const triggerName = 'myTrigger';

      return openwhiskRemove.removeTrigger(triggerName).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith({ triggerName: 'myTrigger' })).to.be.equal(true);
      });
    });

    it('should call removeTriggerHandler with custom namespace', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeTriggerHandler', () => Promise.resolve());
      const triggers = { myTrigger: { namespace: 'myNamespace' } };
      openwhiskRemove.serverless.service.resources = { triggers };
      const triggerName = 'myTrigger';

      return openwhiskRemove.removeTrigger(triggerName).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith({ triggerName: 'myTrigger', namespace: 'myNamespace' }))
          .to.be.equal(true);
      });
    });
  });

  describe('#removeFunctionHandler()', () => {
    it('should remove function handler from openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const stub = params => {
          expect(params).to.be.deep.equal({
            triggerName: mockTriggerObject.triggerName,
            namespace: mockTriggerObject.namespace,
          });
          return Promise.resolve();
        };

        return Promise.resolve({ triggers: { delete: stub } });
      });
      return expect(openwhiskRemove.removeTriggerHandler(mockTriggerObject))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to be removed with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => Promise.resolve(
        { triggers: { delete: () => Promise.reject(err) } }
      ));
      return expect(openwhiskRemove.removeTriggerHandler(mockTriggerObject))
        .to.eventually.be.rejectedWith(
          new RegExp(`${mockTriggerObject.triggerName}.*${err.message}`)
        );
    });
  });
});
