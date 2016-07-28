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

  const mockRuleObject = {
    myRule: 'myTrigger',
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

  describe('#removeRules()', () => {
    it('should call removeRule for each rule', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeRule', () => Promise.resolve());
      const functions = {
        first: { events: [mockRuleObject] },
        second: { events: [mockRuleObject] },
      };
      sandbox.stub(
        openwhiskRemove.serverless.service, 'getAllFunctions', () => Object.keys(functions)
      );
      sandbox.stub(openwhiskRemove.serverless.service, 'getFunction', f => functions[f]);

      return openwhiskRemove.removeRules().then(() => {
        expect(stub.calledTwice).to.be.equal(true);
        expect(stub.calledWith('myRule')).to.be.equal(true);
      });
    });
  });

  describe('#removeRule()', () => {
    it('should remove rule handler from openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const stub = params => {
          expect(params).to.be.deep.equal({
            ruleName: 'myRule',
          });
          return Promise.resolve();
        };

        return Promise.resolve({ rules: { delete: stub } });
      });
      return expect(openwhiskRemove.removeRule('myRule'))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to be removed with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => Promise.resolve(
        { rules: { delete: () => Promise.reject(err) } }
      ));
      return expect(openwhiskRemove.removeRule('myRule'))
        .to.eventually.be.rejectedWith(
          new RegExp(`myRule.*${err.message}`)
        );
    });
  });
});
