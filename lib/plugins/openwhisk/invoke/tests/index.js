'use strict';

const expect = require('chai').expect;
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const OpenWhiskInvoke = require('../');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

require('chai').use(chaiAsPromised);

describe('OpenWhiskInvoke', () => {
  let sandbox;

  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const openwhiskInvoke = new OpenWhiskInvoke(serverless, options);

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(openwhiskInvoke.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(openwhiskInvoke, 'validate').returns(BbPromise.resolve());
      const invokeStub = sinon
        .stub(openwhiskInvoke, 'invoke').returns(BbPromise.resolve());
      const logStub = sinon
        .stub(openwhiskInvoke, 'log').returns(BbPromise.resolve());

      return openwhiskInvoke.hooks['invoke:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
        expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

        openwhiskInvoke.validate.restore();
        openwhiskInvoke.invoke.restore();
        openwhiskInvoke.log.restore();
      });
    });
  });

  describe('#validate()', () => {
    beforeEach(() => {
      serverless.config.servicePath = true;
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
        first: {
          handler: true,
        },
      };
    });

    it('it should parse file if file path is provided', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      openwhiskInvoke.options.path = 'data.json';

      return openwhiskInvoke.validate().then(() => {
        expect(openwhiskInvoke.options.data).to.deep.equal(data);
        openwhiskInvoke.options.path = false;
        serverless.config.servicePath = true;
      });
    });

    it('it should throw if file is not parsed as JSON', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.txt'), 'testing');
      openwhiskInvoke.options.path = 'data.txt';

      expect(() => openwhiskInvoke.validate()).to.throw(Error);
    });

    it('it should throw if type parameter is not valid value', () => {
      openwhiskInvoke.options.type = 'random';
      openwhiskInvoke.options.path = null;
      expect(() => openwhiskInvoke.validate()).to.throw('blocking or nonblocking');
    });

    it('it should throw if log parameter is not valid value', () => {
      openwhiskInvoke.options.type = 'blocking';
      openwhiskInvoke.options.log = 'random';
      openwhiskInvoke.options.path = null;
      expect(() => openwhiskInvoke.validate()).to.throw('result or response');
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => openwhiskInvoke.validate()).to.throw(Error);
      serverless.config.servicePath = true;
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      openwhiskInvoke.options.path = 'some/path';

      expect(() => openwhiskInvoke.validate()).to.throw(Error);

      openwhiskInvoke.options.path = false;
      serverless.config.servicePath = true;
    });
  });

  describe('#invoke()', () => {
    let invokeStub;
    beforeEach(() => {
      openwhiskInvoke.serverless.service.functions = {
        first: {
          namespace: 'sample',
          handler: true,
        },
      };

      openwhiskInvoke.serverless.service.service = 'new-service';
      openwhiskInvoke.options = {
        stage: 'dev',
        function: 'first',
        data: { a: 1 },
      };

      openwhiskInvoke.client = { actions: { invoke: () => {} } };
    });

    afterEach(() => {
      invokeStub.restore();
    });

    it('should invoke with correct params', () => {
      invokeStub = sinon.stub(openwhiskInvoke.client.actions, 'invoke')
        .returns(BbPromise.resolve());
      return openwhiskInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0]).to.be.deep.equal({
          actionName: 'new-service_first',
          blocking: false,
          namespace: 'sample',
          params: { a: 1 },
        });
      });
    }
    );


    it('should reject when sdk client fails', () => {
      invokeStub = sinon.stub(openwhiskInvoke.client.actions, 'invoke').returns(BbPromise.reject());
      return expect(openwhiskInvoke.invoke()).to.be.eventually.rejected;
    });
  });
});
