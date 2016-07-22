'use strict';
const expect = require('chai').expect;
const OpenWhiskDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');
const ClientFactory = require('../../util/client_factory');

require('chai').use(chaiAsPromised);

describe('deployRules', () => {
  let serverless;
  let openwhiskDeploy;
  let sandbox;

  const mockRuleObject = {
    rules: {
      myRule: {
        ruleName: 'myRule',
        namepspace: 'myNamespace',
        action: 'myAction',
        trigger: 'myTrigger',
      },
    },
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskDeploy = new OpenWhiskDeploy(serverless, options);
    openwhiskDeploy.serverless.cli = new serverless.classes.CLI();
    openwhiskDeploy.serverless.service.defaults = {
      namespace: 'testing',
      apihost: 'openwhisk.org',
      auth: 'user:pass',
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#deployRule()', () => {
    it('should deploy function handler to openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = params => {
          expect(params).to.be.deep.equal(mockRuleObject.rules.myRule);
          return Promise.resolve();
        };

        return Promise.resolve({ rules: { create } });
      });
      return expect(openwhiskDeploy.deployRule(mockRuleObject.rules.myRule))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to deploy with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = () => Promise.reject(err);

        return Promise.resolve({ rules: { create } });
      });
      return expect(openwhiskDeploy.deployRule(mockRuleObject.rules.myRule))
        .to.eventually.be.rejectedWith(
          new RegExp(`${mockRuleObject.rules.myRule.ruleName}.*${err.message}`)
        );
    });
  });
});

