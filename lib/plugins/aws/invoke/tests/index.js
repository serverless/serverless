'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const AwsInvoke = require('../');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

describe('AwsInvoke', () => {
  const serverless = new Serverless();
  const awsInvoke = new AwsInvoke(serverless);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvoke.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsInvoke, 'validate').returns(BbPromise.resolve());
      const invokeStub = sinon
        .stub(awsInvoke, 'invoke').returns(BbPromise.resolve());
      const logStub = sinon
        .stub(awsInvoke, 'log').returns(BbPromise.resolve());

      return awsInvoke.hooks['invoke:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
        expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

        awsInvoke.validate.restore();
        awsInvoke.invoke.restore();
        awsInvoke.log.restore();
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
      awsInvoke.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'hello',
      };
    });

    it('it should resolve if all config is valid', () => awsInvoke.validate()
      .then(() => expect(typeof awsInvoke.Lambda).to.not.be.equal('undefined'))
    );

    it('it should parse file if file path is provided', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      awsInvoke.options.path = 'data.json';

      return awsInvoke.validate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal(data);
        awsInvoke.options.path = false;
        serverless.config.servicePath = true;
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => awsInvoke.validate()).to.throw(Error);
      serverless.config.servicePath = true;
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
      awsInvoke.options.path = 'some/path';

      expect(() => awsInvoke.validate()).to.throw(Error);

      awsInvoke.options.path = false;
      serverless.config.servicePath = true;
    });
  });

  describe('#invoke()', () => {
    let invokeStub;
    beforeEach(() => {
      awsInvoke.Lambda = new AWS.Lambda({ region: 'us-east-1' });
      BbPromise.promisifyAll(awsInvoke.Lambda, { suffix: 'Promised' });
      awsInvoke.serverless.service.service = 'new-service';
      awsInvoke.options = {
        function: 'hello',
      };

      invokeStub = sinon.stub(awsInvoke.Lambda, 'invokePromised').returns(BbPromise.resolve());
    });

    it('should invoke with correct params', () => awsInvoke.invoke()
      .then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('RequestResponse');
        expect(invokeStub.args[0][0].LogType).to.be.equal('None');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        awsInvoke.Lambda.invokePromised.restore();
      })
    );

    it('should invoke and log', () => {
      awsInvoke.options.log = true;

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('RequestResponse');
        expect(invokeStub.args[0][0].LogType).to.be.equal('Tail');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        awsInvoke.Lambda.invokePromised.restore();
      });
    });

    it('should invoke with other invocation type', () => {
      awsInvoke.options.type = 'OtherType';

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.args[0][0].FunctionName).to.be.equal('new-service-hello');
        expect(invokeStub.args[0][0].InvocationType).to.be.equal('OtherType');
        expect(invokeStub.args[0][0].LogType).to.be.equal('None');
        expect(typeof invokeStub.args[0][0].Payload).to.not.be.equal('undefined');
        awsInvoke.Lambda.invokePromised.restore();
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

      return awsInvoke.log(invocationReplyMock);
    });
  });
});
