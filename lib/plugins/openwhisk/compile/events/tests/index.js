'use strict';

const expect = require('chai').expect;
const chaiAsPromised = require('chai-as-promised');

require('chai').use(chaiAsPromised);

const sinon = require('sinon');
const OpenWhiskCompileTriggers = require('../index');
const Serverless = require('../../../../../Serverless');

describe('OpenWhiskCompileTriggers', () => {
  let serverless;
  let sandbox;
  let openwhiskCompileTriggers;

  beforeEach(() => {
    serverless = new Serverless();
    sandbox = sinon.sandbox.create();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskCompileTriggers = new OpenWhiskCompileTriggers(serverless, options);
    openwhiskCompileTriggers.serverless.resources = {};
    serverless.service.service = 'serviceName';
    serverless.service.resources = {
      openwhisk: {
        namespace: 'testing',
        apihost: '',
        auth: '',
        triggers: {},
      },
    };

    serverless.cli = { log: () => {} };
    openwhiskCompileTriggers.setup();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#compileTriggers()', () => {
    it('should throw an error if the resource section is not available', () => {
      openwhiskCompileTriggers.serverless.service.resources = {};
      expect(() => openwhiskCompileTriggers.compileTriggers())
        .to.throw(Error, /Missing Triggers section/);
    });

    it('should return empty triggers if manifest has no triggers', () => {
      return expect(openwhiskCompileTriggers.compileTriggers()).to.eventually.resolved;
    });

    it('should call compileTrigger for each trigger definition', () => {
      const triggers = { a: {}, b: {}, c: {} };
      const stub = sinon.stub(openwhiskCompileTriggers, 'compileTrigger');
      openwhiskCompileTriggers.serverless.resources.triggers = triggers;
      return expect(openwhiskCompileTriggers.compileTriggers().then(() => {
        expect(stub.calledThrice).to.be.equal(true);
        Object.keys(triggers).forEach(key => expect(stub.calledWith(key, triggers[key])).to.be.equal(true));
      })).to.eventually.be.resolved;
    });

    it('should update trigger definitions from manifest values', () => {
      const trigger = { overwrite: true, namespace: 'another_ns', parameters: { hello: 'world' }};
      const expected = { triggerName: 'sample', overwrite: true, namespace: 'another_ns', parameters: [{ key: 'hello', value: 'world' }]};
      openwhiskCompileTriggers.serverless.resources.triggers = { sample: trigger };
      return expect(openwhiskCompileTriggers.compileTriggers().then(() => {
        expect(openwhiskCompileTriggers.serverless.service.resources.openwhisk.triggers).to.deep.equal({ sample: expected });
      })).to.eventually.be.resolved;
    });
  });

  describe('#compileTrigger()', () => {
    it('should define triggers without a body', () => {
      const testing = { triggerName: 'testing', namespace: 'testing', overwrite: false };
      const result = openwhiskCompileTriggers.compileTrigger('testing', testing)
      expect(result).to.deep.equal(testing);
    });

    it('should define triggers without manifest params', () => {
      const params = { overwrite: true, namespace: 'another_ns', parameters: { hello: 'world' }};
      const expected = { triggerName: 'testing', overwrite: true, namespace: 'another_ns', parameters: [{ key: 'hello', value: 'world' }]};
      const result = openwhiskCompileTriggers.compileTrigger('testing', params)
      expect(result).to.deep.equal(expected);
    });
  });
});
