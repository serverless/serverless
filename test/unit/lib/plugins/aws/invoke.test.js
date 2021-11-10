'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const { getTmpDirPath } = require('../../../../utils/fs');
const runServerless = require('../../../../utils/run-serverless');
const ServerlessError = require('../../../../../lib/serverless-error');
const fixtures = require('../../../../fixtures/programmatic');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/lib/plugins/aws/invoke.test.js', () => {
  describe('Common', () => {
    let lambdaInvokeStub;
    let result;

    before(async () => {
      lambdaInvokeStub = sinon.stub();

      result = await runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: {
          function: 'callback',
          data: '{"inputKey":"inputValue"}',
          log: true,
        },
        awsRequestStubMap: {
          Lambda: {
            invoke: (args) => {
              lambdaInvokeStub.returns({
                Payload: args.Payload,
                LogResult: Buffer.from('test').toString('base64'),
              });
              return lambdaInvokeStub(args);
            },
          },
        },
      });
    });

    it('should invoke AWS SDK with expected params', () => {
      expect(lambdaInvokeStub).to.be.calledOnce;
      expect(lambdaInvokeStub).to.be.calledWith({
        FunctionName: result.serverless.service.getFunction('callback').name,
        InvocationType: 'RequestResponse',
        LogType: 'Tail',
        Payload: Buffer.from(JSON.stringify({ inputKey: 'inputValue' })),
      });
    });

    it('should support JSON string data', async () => {
      expect(lambdaInvokeStub).to.be.calledWith({
        FunctionName: result.serverless.service.getFunction('callback').name,
        InvocationType: 'RequestResponse',
        LogType: 'Tail',
        Payload: Buffer.from(JSON.stringify({ inputKey: 'inputValue' })),
      });
    });

    it('should log payload', () => {
      expect(result.output).to.contain('"inputKey": "inputValue"');
    });
  });

  it('should accept no data', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from('{}'),
    });
  });

  it('should support plain string data', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        data: 'simple-string',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from(JSON.stringify('simple-string')),
    });
  });

  it('should should not attempt to parse data with raw option', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        data: '{"inputKey":"inputValue"}',
        raw: true,
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from(JSON.stringify('{"inputKey":"inputValue"}')),
    });
  });

  it('should support JSON file path as data', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        path: 'payload.json',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from(JSON.stringify({ dataInputKey: 'dataInputValue' })),
    });
  });

  it('should support absolute file path as data', async () => {
    const lambdaInvokeStub = sinon.stub();
    const { servicePath: serviceDir } = await fixtures.setup('invocation');
    const pathToPayload = path.join(serviceDir, 'payload.json');
    const result = await runServerless({
      cwd: serviceDir,
      command: 'invoke',
      options: {
        function: 'callback',
        path: pathToPayload,
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from(JSON.stringify({ dataInputKey: 'dataInputValue' })),
    });
  });

  it('should support YAML file path as data', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        path: 'payload.yaml',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: Buffer.from(JSON.stringify({ dataInputKey: 'dataInputValue' })),
    });
  });

  it('should throw error if data file path does not exist', async () => {
    await expect(
      runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: {
          function: 'callback',
          path: 'not-existing.yaml',
        },
      })
    ).to.eventually.be.rejected.and.have.property('code', 'FILE_NOT_FOUND');
  });

  it('should throw error if function is not provided', async () => {
    await expect(
      runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: { function: 'notExisting' },
      })
    ).to.eventually.be.rejected.and.have.property('code', 'FUNCTION_MISSING_IN_SERVICE');
  });

  it('should support --type option', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        type: 'Event',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'Event',
      LogType: 'None',
      Payload: Buffer.from('{}'),
    });
  });

  it('should support --qualifier option', async () => {
    const lambdaInvokeStub = sinon.stub();
    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        qualifier: 'foo',
      },
      awsRequestStubMap: {
        Lambda: {
          invoke: (args) => {
            lambdaInvokeStub.returns('payload');
            return lambdaInvokeStub(args);
          },
        },
      },
    });
    expect(lambdaInvokeStub.args[0][0]).to.deep.equal({
      FunctionName: result.serverless.service.getFunction('callback').name,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Qualifier: 'foo',
      Payload: Buffer.from('{}'),
    });
  });

  it('should support `--context` param', async () => {
    const lambdaInvokeStub = sinon.stub();

    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        context: 'somecontext',
      },
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
      command: 'invoke',
      options: {
        function: 'callback',
        context: '{"ctx": "somecontext"}',
        raw: true,
      },
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
    const contextDataFilePath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'fixtures',
      'programmatic',
      'invocation',
      'context.json'
    );

    const result = await runServerless({
      fixture: 'invocation',
      command: 'invoke',
      options: {
        function: 'callback',
        contextPath: contextDataFilePath,
      },
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

    const contextDataFilePath = path.join(getTmpDirPath(), 'context.json');

    await expect(
      runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: {
          function: 'callback',
          contextPath: contextDataFilePath,
        },
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

  it('should fail the process for failed invocations', async () => {
    const lambdaInvokeStub = sinon.stub();
    await expect(
      runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: {
          function: 'callback',
        },
        awsRequestStubMap: {
          Lambda: {
            invoke: (args) => {
              lambdaInvokeStub.returns({
                Payload: args.Payload,
                LogResult: Buffer.from('test').toString('base64'),
                FunctionError: true,
              });
              return lambdaInvokeStub(args);
            },
          },
        },
      })
    ).to.be.eventually.rejectedWith(Error, 'Invoked function failed');
  });

  it('should resolve if path is not given', async () => {
    const lambdaInvokeStub = sinon.stub();
    await expect(
      runServerless({
        fixture: 'invocation',
        command: 'invoke',
        options: {
          function: 'callback',
          path: false,
        },
        awsRequestStubMap: {
          Lambda: {
            invoke: (args) => {
              lambdaInvokeStub.returns('payload');
              return lambdaInvokeStub(args);
            },
          },
        },
      })
    ).to.be.eventually.fulfilled;
  });
});
