'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const proxyquire = require('proxyquire');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../utils/fs');
const runServerless = require('../../../../utils/run-serverless');
const { ServerlessError } = require('../../../../../lib/classes/Error');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

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

describe('test/unit/lib/plugins/aws/invoke.test.js', () => {
  describe.skip('Common', () => {
    before(async () => {
      await runServerless({
        fixture: 'invocation',
        cliArgs: ['invoke', '--function', 'callback', '--data', '{"inputKey":"inputValue"}'],
        awsRequestStubMap: {
          // Stub AWS SDK invocation
        },
      });
    });

    it('TODO: should invoke AWS SDK with expected params', async () => {
      // Confirm that AWS SDK stub was ivoked with expected params (confirm all params)
      // Replaces
      // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L221-L234
    });

    it('TODO: should support JSON string data', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L123-L129
    });

    it('TODO: should log payload', async () => {
      // Confirm by inspecting stdout, that it logs data as returned by our AWS SDK stub
      // Replaces
      // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L236-L251
      // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L301-L315
    });
  });

  xit('TODO: should accept no data', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L107-L113
  });

  xit('TODO: should support plain string data', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--data', 'inputData'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L115-L121
  });

  xit('TODO: should should not attempt to parse data with raw option', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--data', '{"inputKey":"inputValue"}', '--raw'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L131-L138
  });

  xit('TODO: should support JSON file path as data', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--path', 'payload.json'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L140-L154
  });

  xit('TODO: should support absolute file path as data', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: [
        'invoke',
        '--function',
        'callback',
        '--path' /* TODO: Pass absolute path to payload.json in fixture */,
      ],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L156-L168
  });

  xit('TODO: should support YAML file path as data', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--path', 'payload.yaml'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Payload` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L170-L185
  });

  xit('TODO: should throw error if data file path does not exist', async () => {
    await expect(
      runServerless({
        fixture: 'invocation',
        cliArgs: ['invoke', '--function', 'callback', '--path', 'not-existing.yaml'],
      })
    ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L192-L199
  });

  xit('TODO: should throw error if function is not provided', async () => {
    await expect(
      runServerless({
        fixture: 'invocation',
        cliArgs: ['invoke', '--function', 'notExisting'],
      })
    ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L102-L105
  });

  xit('TODO: should support --type option', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--type', 'Event'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `InvocationType` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L253-L267
  });

  xit('TODO: should support --qualifier option', async () => {
    await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--qualifier', 'foo'],
      awsRequestStubMap: {
        // Stub AWS SDK invocation, and confirm `Qualifier` param
      },
    });
    // Replaces
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L269-L287
  });

  it('should support `--context` param', async () => {
    const lambdaInvokeStub = sinon.stub();

    const result = await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--context', 'somecontext'],
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub).to.have.been.calledOnce;
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      ClientContext: 'InNvbWVjb250ZXh0Ig==', // "somecontext"
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from('{}'),
    });
  });

  it('should support `--context` param with `--raw` param', async () => {
    const lambdaInvokeStub = sinon.stub();

    const result = await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--raw', '--context', '{"ctx": "somecontext"}'],
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub).to.have.been.calledOnce;
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      ClientContext: 'IntcImN0eFwiOiBcInNvbWVjb250ZXh0XCJ9Ig==', // "{\"ctx\": \"somecontext\"}"
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from('{}'),
    });
  });

  it('should support `--contextPath` param', async () => {
    const lambdaInvokeStub = sinon.stub();
    const contextDataFile = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'fixtures',
      'invocation',
      'context.json'
    );

    const result = await runServerless({
      fixture: 'invocation',
      cliArgs: ['invoke', '--function', 'callback', '--contextPath', contextDataFile],
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub).to.have.been.calledOnce;
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      ClientContext: 'eyJ0ZXN0UHJvcCI6InRlc3RWYWx1ZSJ9', // {"testProp":"testValue"}
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from('{}'),
    });
  });

  it('should throw error on invoke with contextPath if file not exists', async () => {
    const lambdaInvokeStub = sinon.stub();

    const contextDataFile = path.join(getTmpDirPath(), 'context.json');

    await expect(
      runServerless({
        fixture: 'invocation',
        cliArgs: ['invoke', '--function', 'callback', '--contextPath', contextDataFile],
        awsRequestStubMap: {
          Lambda: {
            invoke: (args) => {
              lambdaInvokeStub.returns('payload');
              return lambdaInvokeStub(args);
            },
          },
        },
      })
    )
      .to.be.eventually.rejectedWith(ServerlessError)
      .and.have.property('code', 'FILE_NOT_FOUND');
    expect(lambdaInvokeStub).to.have.been.callCount(0);
  });

  xit('TODO: should fail the process for failed invocations', async () => {
    await expect(
      runServerless({
        fixture: 'invocation',
        cliArgs: ['invoke', '--function', 'callback', '--path', 'not-existing.yaml'],
      })
    ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    // Replace
    // https://github.com/serverless/serverless/blob/537fcac7597f0c6efbae7a5fc984270a78a2a53a/test/unit/lib/plugins/aws/invoke.test.js#L317-L332
  });
});
