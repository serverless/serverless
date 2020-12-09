'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const proxyquire = require('proxyquire');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../utils/fs');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('AwsInvoke', () => {
  let AwsInvoke;
  let awsInvoke;
  let serverless;
  let stdinStub;
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };

  beforeEach(() => {
    stdinStub = sinon.stub().resolves('');
    AwsInvoke = proxyquire('../../../../../lib/plugins/aws/invoke', {
      'get-stdin': stdinStub,
    });
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.processedInput = { commands: ['invoke'] };
    awsInvoke = new AwsInvoke(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvoke.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsInvoke.provider).to.be.instanceof(AwsProvider));

    it('should run promise chain in order', async () => {
      const validateStub = sinon.stub(awsInvoke, 'extendedValidate').resolves();
      const invokeStub = sinon.stub(awsInvoke, 'invoke').resolves();
      const logStub = sinon.stub(awsInvoke, 'log').resolves();

      await awsInvoke.hooks['invoke:invoke']();

      expect(validateStub.calledOnce).to.be.equal(true);
      expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
      expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

      awsInvoke.extendedValidate.restore();
      awsInvoke.invoke.restore();
      awsInvoke.log.restore();
    });

    it('should set an empty options object if no options are given', () => {
      const awsInvokeWithEmptyOptions = new AwsInvoke(serverless);

      expect(awsInvokeWithEmptyOptions.options).to.deep.equal({});
    });
  });

  describe('#extendedValidate()', () => {
    let backupIsTTY;
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
      awsInvoke.provider.cachedCredentials = { accessKeyId: 'foo', secretAccessKey: 'bar' };

      // Ensure there's no attempt to read path from stdin
      backupIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;
    });

    afterEach(() => {
      if (backupIsTTY) process.stdin.isTTY = backupIsTTY;
      else delete process.stdin.isTTY;
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      return expect(awsInvoke.extendedValidate()).to.be.rejected;
    });

    it('should not throw error when there is no input data', async () => {
      awsInvoke.options.data = undefined;

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.equal('');
    });

    it('should keep data if it is a simple string', async () => {
      awsInvoke.options.data = 'simple-string';

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.equal('simple-string');
    });

    it('should parse data if it is a json string', async () => {
      awsInvoke.options.data = '{"key": "value"}';

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.deep.equal({ key: 'value' });
    });

    it('should skip parsing data if "raw" requested', async () => {
      awsInvoke.options.data = '{"key": "value"}';
      awsInvoke.options.raw = true;

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.deep.equal('{"key": "value"}');
    });

    it('it should parse file if relative file path is provided', async () => {
      serverless.config.servicePath = getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.json'),
        JSON.stringify(data)
      );
      awsInvoke.options.path = 'data.json';

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.deep.equal(data);
    });

    it('it should parse file if absolute file path is provided', async () => {
      serverless.config.servicePath = getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      awsInvoke.options.path = dataFile;

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.deep.equal(data);
    });

    it('it should parse a yaml file if file path is provided', async () => {
      serverless.config.servicePath = getTmpDirPath();
      const yamlContent = 'testProp: testValue';

      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.yml'),
        yamlContent
      );
      awsInvoke.options.path = 'data.yml';

      await expect(awsInvoke.extendedValidate()).to.be.fulfilled;

      expect(awsInvoke.options.data).to.deep.equal({
        testProp: 'testValue',
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      return expect(awsInvoke.extendedValidate()).to.be.rejected;
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = getTmpDirPath();
      awsInvoke.options.path = 'some/path';

      return expect(awsInvoke.extendedValidate()).to.be.rejectedWith(
        'The file you provided does not exist.'
      );
    });

    it('should resolve if path is not given', () => {
      awsInvoke.options.path = false;
      return expect(awsInvoke.extendedValidate()).to.be.fulfilled;
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

    it('should invoke with correct params', async () => {
      await awsInvoke.invoke();

      expect(invokeStub.calledOnce).to.be.equal(true);
      expect(
        invokeStub.calledWithExactly('Lambda', 'invoke', {
          FunctionName: 'customName',
          InvocationType: 'RequestResponse',
          LogType: 'None',
          Payload: Buffer.from(JSON.stringify({})),
        })
      ).to.be.equal(true);
      awsInvoke.provider.request.restore();
    });

    it('should invoke and log', async () => {
      awsInvoke.options.log = true;

      await awsInvoke.invoke();

      expect(invokeStub.calledOnce).to.be.equal(true);
      expect(
        invokeStub.calledWithExactly('Lambda', 'invoke', {
          FunctionName: 'customName',
          InvocationType: 'RequestResponse',
          LogType: 'Tail',
          Payload: Buffer.from(JSON.stringify({})),
        })
      ).to.be.equal(true);
      awsInvoke.provider.request.restore();
    });

    it('should invoke with other invocation type', async () => {
      awsInvoke.options.type = 'OtherType';

      await awsInvoke.invoke();
      expect(invokeStub.calledOnce).to.be.equal(true);
      expect(
        invokeStub.calledWithExactly('Lambda', 'invoke', {
          FunctionName: 'customName',
          InvocationType: 'OtherType',
          LogType: 'None',
          Payload: Buffer.from(JSON.stringify({})),
        })
      ).to.be.equal(true);
      awsInvoke.provider.request.restore();
    });

    it('should be able to invoke with a qualifier', async () => {
      awsInvoke.options.qualifier = 'somelongqualifier';

      await awsInvoke.invoke();

      expect(invokeStub.calledOnce).to.be.equal(true);

      expect(
        invokeStub.calledWithExactly('Lambda', 'invoke', {
          FunctionName: 'customName',
          InvocationType: 'RequestResponse',
          LogType: 'None',
          Payload: Buffer.from(JSON.stringify({})),
          Qualifier: 'somelongqualifier',
        })
      ).to.be.equal(true);

      awsInvoke.provider.request.restore();
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

      awsInvoke.log(invocationReplyMock);

      const expectedPayloadMessage = '{\n    "testProp": "testValue"\n}';
      expect(consoleLogStub.calledWith(expectedPayloadMessage)).to.equal(true);
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

      return expect(() => awsInvoke.log(invocationReplyMock)).to.throw(
        Error,
        'Invoked function failed'
      );
    });
  });
});
