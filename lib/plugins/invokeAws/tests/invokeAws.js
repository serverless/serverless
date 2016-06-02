'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const InvokeAws = require('../invokeAws');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

const serverless = new Serverless();
const invokeAws = new InvokeAws(serverless);

describe('InvokeAws', () => {
  describe('#constructor()', () => {
    it('should have hooks', () => expect(invokeAws.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(invokeAws, 'validate').returns(BbPromise.resolve());
      const invokeStub = sinon
        .stub(invokeAws, 'invoke').returns(BbPromise.resolve());
      const logStub = sinon
        .stub(invokeAws, 'log').returns(BbPromise.resolve());

      return invokeAws.hooks['invoke:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
        expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

        invokeAws.validate.restore();
        invokeAws.invoke.restore();
        invokeAws.log.restore();
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
              aws_useast1: {
                vars: {},
              },
            },
          },
        },
      };
      serverless.service.functions = {
        hello: {
          handler: true,
        },
      };
      invokeAws.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'hello',
      };
    });

    it('it should resolve if all config is valid', () => invokeAws.validate()
      .then(() => expect(typeof invokeAws.Lambda).to.not.be.equal('undefined'))
    );

    it('it should parse file if file path is provided', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      invokeAws.options.path = 'data.json';
      return invokeAws.validate().then(() => {
        expect(invokeAws.options.data).to.deep.equal(data);
        invokeAws.options.path = false;
        serverless.config.servicePath = true;
      });
    });

    it('it should throw error if function is missing', () => {
      invokeAws.options.function = false;
      expect(() => invokeAws.validate()).to.throw(Error);
      invokeAws.options.function = 'hello';
    });

    it('it should throw error if stage is missing', () => {
      invokeAws.options.stage = null;
      expect(() => invokeAws.validate()).to.throw(Error);
      invokeAws.options.stage = 'dev';
    });

    it('it should throw error if region is missing', () => {
      invokeAws.options.region = null;
      expect(() => invokeAws.validate()).to.throw(Error);
      invokeAws.options.region = 'us-east-1';
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => invokeAws.validate()).to.throw(Error);
      serverless.config.servicePath = true;
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      invokeAws.options.path = 'some/path';
      expect(() => invokeAws.validate()).to.throw(Error);
      invokeAws.options.path = false;
      serverless.config.servicePath = true;
    });
  });

  describe('#invoke()', () => {
    let invokeStub;
    beforeEach(() => {
      invokeAws.Lambda = new AWS.Lambda({ region: 'us-east-1' });
      BbPromise.promisifyAll(invokeAws.Lambda, { suffix: 'Promised' });
      invokeAws.serverless.service.service = 'new-service';
      invokeAws.options = {
        function: 'hello',
      };

      invokeStub = sinon.stub(invokeAws.Lambda, 'invokePromised').returns(BbPromise.resolve());
    });

    it('should invoke with correct params', () => invokeAws.invoke()
      .then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('RequestResponse');
        expect(invokeStub.args[0][0].LogType).to.be.equal('None');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        invokeAws.Lambda.invokePromised.restore();
      })
    );

    it('should invoke and log', () => {
      invokeAws.options.log = true;
      return invokeAws.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('RequestResponse');
        expect(invokeStub.args[0][0].LogType).to.be.equal('Tail');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        invokeAws.Lambda.invokePromised.restore();
      });
    });

    it('should invoke with other invocation type', () => {
      invokeAws.options.type = 'OtherType';
      return invokeAws.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('OtherType');
        expect(invokeStub.args[0][0].LogType).to.be.equal('None');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        invokeAws.Lambda.invokePromised.restore();
      });
    });
  });

  describe('#log()', () => {
    it('should log payload', () => {
      const invocationReplyMock = {
        Payload: `
        {
         "testProp": "testValue"
        }
        `,
        LogResult: 'test',
      };

      return invokeAws.log(invocationReplyMock);
    });
  });
});
