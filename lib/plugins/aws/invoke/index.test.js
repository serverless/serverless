'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsInvoke = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

describe('AwsInvoke', () => {
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless, options));
  const awsInvoke = new AwsInvoke(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvoke.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider',
      () => expect(awsInvoke.provider).to.be.instanceof(AwsProvider));

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsInvoke, 'extendedValidate').resolves();
      const invokeStub = sinon
        .stub(awsInvoke, 'invoke').resolves();
      const logStub = sinon
        .stub(awsInvoke, 'log').resolves();

      return awsInvoke.hooks['invoke:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
        expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

        awsInvoke.extendedValidate.restore();
        awsInvoke.invoke.restore();
        awsInvoke.log.restore();
      });
    });

    it('should set an empty options object if no options are given', () => {
      const awsInvokeWithEmptyOptions = new AwsInvoke(serverless);

      expect(awsInvokeWithEmptyOptions.options).to.deep.equal({});
    });
  });

  describe('#extendedValidate()', () => {
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
      awsInvoke.options.data = null;
      awsInvoke.options.path = false;
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsInvoke.extendedValidate()).to.throw(Error);
    });

    it('should not throw error when there are no input data', () => {
      awsInvoke.options.data = undefined;

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.equal('');
      });
    });

    it('should keep data if it is a simple string', () => {
      awsInvoke.options.data = 'simple-string';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.equal('simple-string');
      });
    });

    it('should parse data if it is a json string', () => {
      awsInvoke.options.data = '{"key": "value"}';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal({ key: 'value' });
      });
    });

    it('should skip parsing data if "raw" requested', () => {
      awsInvoke.options.data = '{"key": "value"}';
      awsInvoke.options.raw = true;

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal('{"key": "value"}');
      });
    });

    it('it should parse file if relative file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      awsInvoke.options.path = 'data.json';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal(data);
      });
    });

    it('it should parse file if absolute file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      awsInvoke.options.path = dataFile;

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal(data);
      });
    });

    it('it should parse a yaml file if file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const yamlContent = 'testProp: testValue';

      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.yml'), yamlContent);
      awsInvoke.options.path = 'data.yml';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal({
          testProp: 'testValue',
        });
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => awsInvoke.extendedValidate()).to.throw(Error);
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      awsInvoke.options.path = 'some/path';

      return awsInvoke.extendedValidate().catch((err) => {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.equal('The file you provided does not exist.');
      });
    });

    it('should resolve if path is not given', (done) => {
      awsInvoke.options.path = false;

      awsInvoke.extendedValidate().then(() => done());
    });
  });

  describe('#invoke()', () => {
    let invokeStub;
    beforeEach(() => {
      invokeStub = sinon.stub(awsInvoke.provider, 'request').resolves();
      awsInvoke.serverless.service.service = 'new-service';
      awsInvoke.options = {
        stage: 'dev',
        function: 'first',
        functionObj: {
          name: 'customName',
        },
      };
    });

    it('should invoke with correct params', () => awsInvoke.invoke()
      .then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'RequestResponse',
            LogType: 'None',
            Payload: new Buffer(JSON.stringify({})),
          }
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      })
    );

    it('should invoke and log', () => {
      awsInvoke.options.log = true;

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'RequestResponse',
            LogType: 'Tail',
            Payload: new Buffer(JSON.stringify({})),
          }
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      });
    });

    it('should invoke with other invocation type', () => {
      awsInvoke.options.type = 'OtherType';

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'OtherType',
            LogType: 'None',
            Payload: new Buffer(JSON.stringify({})),
          }
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      });
    });
  });

  describe('#log()', () => {
    let consoleLogStub;

    beforeEach(() => {
      consoleLogStub = sinon.stub(awsInvoke, 'consoleLog');
    });

    afterEach(() => {
      awsInvoke.consoleLog.restore();
    });

    it('should log payload', () => {
      const invocationReplyMock = {
        Payload: `
        {
         "testProp": "testValue"
        }
        `,
        LogResult: 'test',
      };

      return awsInvoke.log(invocationReplyMock).then(() => {
        const expectedPayloadMessage = '{\n    "testProp": "testValue"\n}';

        expect(consoleLogStub.calledWith(expectedPayloadMessage)).to.equal(true);
      });
    });

    it('rejects the promise for failed invocations', () => {
      const invocationReplyMock = {
        Payload: `
        {
         "testProp": "testValue"
        }
        `,
        LogResult: 'test',
        FunctionError: true,
      };

      return awsInvoke.log(invocationReplyMock).catch(err => {
        expect(err).to
          .and.be.instanceof(Error)
          .and.have.property('message', 'Invoked function failed');
      });
    });
  });
});
