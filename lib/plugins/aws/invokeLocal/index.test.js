'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const EventEmitter = require('events');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const stripAnsi = require('strip-ansi');
const overrideEnv = require('process-utils/override-env');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const { getTmpDirPath } = require('../../../../test/utils/fs');
const skipWithNotice = require('@serverless/test/skip-with-notice');
const log = require('log').get('serverless:test');

chai.use(require('chai-as-promised'));

chai.should();

const expect = chai.expect;

describe('AwsInvokeLocal', () => {
  let AwsInvokeLocal;
  let awsInvokeLocal;
  let options;
  let serverless;
  let provider;
  let stdinStub;
  let spawnExtStub;
  let spawnStub;
  let writeChildStub;
  let endChildStub;

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
    };
    spawnStub = sinon.stub();
    endChildStub = sinon.stub();
    writeChildStub = sinon.stub();
    spawnExtStub = sinon.stub().resolves({
      stdoutBuffer: Buffer.from('Mocked output'),
    });
    spawnStub = sinon.stub().returns({
      stderr: new EventEmitter().on('data', () => {}),
      stdout: new EventEmitter().on('data', () => {}),
      stdin: {
        write: writeChildStub,
        end: endChildStub,
      },
      on: (key, callback) => {
        if (key === 'close') process.nextTick(callback);
      },
    });

    stdinStub = sinon.stub().resolves('');
    AwsInvokeLocal = proxyquire('./index', {
      'get-stdin': stdinStub,
      'child-process-ext/spawn': spawnExtStub,
    });
    serverless = new Serverless();
    serverless.config.servicePath = 'servicePath';
    serverless.cli = new CLI(serverless);
    serverless.processedInput = { commands: ['invoke'] };
    provider = new AwsProvider(serverless, options);
    provider.cachedCredentials = {
      credentials: { accessKeyId: 'foo', secretAccessKey: 'bar' },
    };
    serverless.setProvider('aws', provider);
    awsInvokeLocal = new AwsInvokeLocal(serverless, options);
    awsInvokeLocal.provider = provider;
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvokeLocal.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsInvokeLocal.provider).to.be.instanceof(AwsProvider));

    it('should run invoke:local:invoke promise chain in order', () => {
      const invokeLocalStub = sinon.stub(awsInvokeLocal, 'invokeLocal').resolves();

      return awsInvokeLocal.hooks['invoke:local:invoke']().then(() => {
        expect(invokeLocalStub.callCount).to.be.equal(1);

        awsInvokeLocal.invokeLocal.restore();
      });
    });

    it('should run before:invoke:local:loadEnvVars promise chain in order', () => {
      const validateStub = sinon.stub(awsInvokeLocal, 'extendedValidate').resolves();
      const loadEnvVarsStub = sinon.stub(awsInvokeLocal, 'loadEnvVars').resolves();

      return awsInvokeLocal.hooks['before:invoke:local:loadEnvVars']().then(() => {
        expect(validateStub.callCount).to.be.equal(1);
        expect(loadEnvVarsStub.calledAfter(validateStub)).to.be.equal(true);

        awsInvokeLocal.extendedValidate.restore();
        awsInvokeLocal.loadEnvVars.restore();
      });
    });

    it('should set an empty options object if no options are given', () => {
      const awsInvokeWithEmptyOptions = new AwsInvokeLocal(serverless);

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
      awsInvokeLocal.options.data = null;
      awsInvokeLocal.options.path = false;

      // Ensure there's no attempt to read path from stdin
      backupIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;
    });

    afterEach(() => {
      if (backupIsTTY) process.stdin.isTTY = backupIsTTY;
      else delete process.stdin.isTTY;
    });

    it('should not throw error when there are no input data', () => {
      awsInvokeLocal.options.data = undefined;

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.equal('');
      });
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      return expect(awsInvokeLocal.extendedValidate()).to.be.rejected;
    });

    it('should keep data if it is a simple string', () => {
      awsInvokeLocal.options.data = 'simple-string';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.equal('simple-string');
      });
    });

    it('should parse data if it is a json string', () => {
      awsInvokeLocal.options.data = '{"key": "value"}';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal({ key: 'value' });
      });
    });

    it('should skip parsing data if "raw" requested', () => {
      awsInvokeLocal.options.data = '{"key": "value"}';
      awsInvokeLocal.options.raw = true;

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal('{"key": "value"}');
      });
    });

    it('should parse context if it is a json string', () => {
      awsInvokeLocal.options.context = '{"key": "value"}';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.context).to.deep.equal({ key: 'value' });
      });
    });

    it('should skip parsing context if "raw" requested', () => {
      awsInvokeLocal.options.context = '{"key": "value"}';
      awsInvokeLocal.options.raw = true;

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.context).to.deep.equal('{"key": "value"}');
      });
    });

    it('it should parse file if relative file path is provided', () => {
      serverless.config.servicePath = getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.json'),
        JSON.stringify(data)
      );
      awsInvokeLocal.options.contextPath = 'data.json';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.context).to.deep.equal(data);
      });
    });

    it('it should parse file if absolute file path is provided', () => {
      serverless.config.servicePath = getTmpDirPath();
      const data = {
        event: {
          testProp: 'testValue',
        },
      };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      awsInvokeLocal.options.path = dataFile;
      awsInvokeLocal.options.contextPath = false;

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal(data);
      });
    });

    it('it should parse a yaml file if file path is provided', () => {
      serverless.config.servicePath = getTmpDirPath();
      const yamlContent = 'event: data';

      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.yml'),
        yamlContent
      );
      awsInvokeLocal.options.path = 'data.yml';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal({ event: 'data' });
      });
    });

    it('it should require a js file if file path is provided', () => {
      serverless.config.servicePath = getTmpDirPath();
      const jsContent = [
        'module.exports = {',
        '  headers: { "Content-Type" : "application/json" },',
        '  body: JSON.stringify([100, 200]),',
        '}',
      ].join('\n');

      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.js'),
        jsContent
      );
      awsInvokeLocal.options.path = 'data.js';

      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled.then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal({
          headers: { 'Content-Type': 'application/json' },
          body: '[100,200]',
        });
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      return expect(awsInvokeLocal.extendedValidate()).to.be.rejected;
    });

    it('it should reject error if file path does not exist', () => {
      serverless.config.servicePath = getTmpDirPath();
      awsInvokeLocal.options.path = 'some/path';

      return expect(awsInvokeLocal.extendedValidate()).to.be.rejected;
    });

    it('should resolve if path is not given', () => {
      awsInvokeLocal.options.path = false;
      return expect(awsInvokeLocal.extendedValidate()).to.be.fulfilled;
    });
  });

  describe('#getCredentialEnvVars()', () => {
    it('returns empty object when credentials is not set', () => {
      provider.cachedCredentials = null;
      serverless.service.provider.credentials = null;

      const credentialEnvVars = awsInvokeLocal.getCredentialEnvVars();

      expect(credentialEnvVars).to.be.eql({});
    });

    it('returns credential env vars from cached credentials', () => {
      provider.cachedCredentials = {
        credentials: {
          accessKeyId: 'ID',
          secretAccessKey: 'SECRET',
          sessionToken: 'TOKEN',
        },
      };
      serverless.service.provider.credentials = null;

      const credentialEnvVars = awsInvokeLocal.getCredentialEnvVars();

      expect(credentialEnvVars).to.be.eql({
        AWS_ACCESS_KEY_ID: 'ID',
        AWS_SECRET_ACCESS_KEY: 'SECRET',
        AWS_SESSION_TOKEN: 'TOKEN',
      });
    });

    it('returns credential env vars from credentials config', () => {
      provider.cachedCredentials = null;
      serverless.service.provider.credentials = {
        accessKeyId: 'ID',
        secretAccessKey: 'SECRET',
        sessionToken: 'TOKEN',
      };

      const credentialEnvVars = awsInvokeLocal.getCredentialEnvVars();

      expect(credentialEnvVars).to.be.eql({
        AWS_ACCESS_KEY_ID: 'ID',
        AWS_SECRET_ACCESS_KEY: 'SECRET',
        AWS_SESSION_TOKEN: 'TOKEN',
      });
    });
  });

  describe('#loadEnvVars()', () => {
    let restoreEnv;
    beforeEach(() => {
      ({ restoreEnv } = overrideEnv());
      serverless.config.servicePath = true;
      serverless.service.provider = {
        environment: {
          providerVar: 'providerValue',
        },
      };

      awsInvokeLocal.provider.options.region = 'us-east-1';
      awsInvokeLocal.options = {
        functionObj: {
          name: 'serviceName-dev-hello',
          environment: {
            functionVar: 'functionValue',
          },
        },
      };
    });

    afterEach(() => restoreEnv());

    it('it should load provider env vars', () =>
      awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.providerVar).to.be.equal('providerValue');
      }));

    it('it should load provider profile env', () => {
      serverless.service.provider.profile = 'jdoe';
      return awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.AWS_PROFILE).to.be.equal('jdoe');
      });
    });

    it('it should load function env vars', () =>
      awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.functionVar).to.be.equal('functionValue');
      }));

    it('it should load default lambda env vars', () =>
      awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.LANG).to.equal('en_US.UTF-8');
        expect(process.env.LD_LIBRARY_PATH).to.equal(
          '/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib'
        ); // eslint-disable-line max-len
        expect(process.env.LAMBDA_TASK_ROOT).to.equal('/var/task');
        expect(process.env.LAMBDA_RUNTIME_DIR).to.equal('/var/runtime');
        expect(process.env.AWS_REGION).to.equal('us-east-1');
        expect(process.env.AWS_DEFAULT_REGION).to.equal('us-east-1');
        expect(process.env.AWS_LAMBDA_LOG_GROUP_NAME).to.equal('/aws/lambda/serviceName-dev-hello');
        expect(process.env.AWS_LAMBDA_LOG_STREAM_NAME).to.equal(
          '2016/12/02/[$LATEST]f77ff5e4026c45bda9a9ebcec6bc9cad'
        );
        expect(process.env.AWS_LAMBDA_FUNCTION_NAME).to.equal('serviceName-dev-hello');
        expect(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).to.equal('1024');
        expect(process.env.AWS_LAMBDA_FUNCTION_VERSION).to.equal('$LATEST');
        expect(process.env.NODE_PATH).to.equal('/var/runtime:/var/task:/var/runtime/node_modules');
      }));

    it('it should set credential env vars #1', () => {
      provider.cachedCredentials = {
        credentials: {
          accessKeyId: 'ID',
          secretAccessKey: 'SECRET',
        },
      };

      return awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.AWS_ACCESS_KEY_ID).to.equal('ID');
        expect(process.env.AWS_SECRET_ACCESS_KEY).to.equal('SECRET');
        expect('AWS_SESSION_TOKEN' in process.env).to.equal(false);
      });
    });

    it('it should set credential env vars #2', () => {
      provider.cachedCredentials = {
        credentials: {
          sessionToken: 'TOKEN',
        },
      };
      return awsInvokeLocal
        .loadEnvVars()

        .then(() => {
          expect(process.env.AWS_SESSION_TOKEN).to.equal('TOKEN');
          expect('AWS_ACCESS_KEY_ID' in process.env).to.equal(false);
          expect('AWS_SECRET_ACCESS_KEY' in process.env).to.equal(false);
        });
    });

    it('it should work without cached credentials set', () => {
      provider.cachedCredentials = null;
      return awsInvokeLocal
        .loadEnvVars()

        .then(() => {
          expect('AWS_SESSION_TOKEN' in process.env).to.equal(false);
          expect('AWS_ACCESS_KEY_ID' in process.env).to.equal(false);
          expect('AWS_SECRET_ACCESS_KEY' in process.env).to.equal(false);
        });
    });

    it('should fallback to service provider configuration when options are not available', () => {
      awsInvokeLocal.provider.options.region = null;
      awsInvokeLocal.serverless.service.provider.region = 'us-west-1';

      return awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.AWS_REGION).to.equal('us-west-1');
        expect(process.env.AWS_DEFAULT_REGION).to.equal('us-west-1');
      });
    });

    it('it should overwrite provider env vars', () => {
      awsInvokeLocal.options.functionObj.environment.providerVar = 'providerValueOverwritten';

      return awsInvokeLocal.loadEnvVars().then(() => {
        expect(process.env.providerVar).to.be.equal('providerValueOverwritten');
      });
    });
  });

  describe('#invokeLocal()', () => {
    let invokeLocalNodeJsStub;
    let invokeLocalPythonStub;
    let invokeLocalJavaStub;
    let invokeLocalRubyStub;
    let invokeLocalDockerStub;

    beforeEach(() => {
      invokeLocalNodeJsStub = sinon.stub(awsInvokeLocal, 'invokeLocalNodeJs').resolves();
      invokeLocalPythonStub = sinon.stub(awsInvokeLocal, 'invokeLocalPython').resolves();
      invokeLocalJavaStub = sinon.stub(awsInvokeLocal, 'invokeLocalJava').resolves();
      invokeLocalRubyStub = sinon.stub(awsInvokeLocal, 'invokeLocalRuby').resolves();
      invokeLocalDockerStub = sinon.stub(awsInvokeLocal, 'invokeLocalDocker').resolves();

      awsInvokeLocal.serverless.service.service = 'new-service';
      awsInvokeLocal.provider.options.stage = 'dev';
      awsInvokeLocal.options = {
        function: 'first',
        functionObj: {
          handler: 'handler.hello',
          name: 'hello',
        },
        data: {},
      };
    });

    afterEach(() => {
      awsInvokeLocal.invokeLocalNodeJs.restore();
      awsInvokeLocal.invokeLocalPython.restore();
      awsInvokeLocal.invokeLocalJava.restore();
      awsInvokeLocal.invokeLocalRuby.restore();
    });

    it('should call invokeLocalNodeJs when no runtime is set', () =>
      awsInvokeLocal.invokeLocal().then(() => {
        expect(invokeLocalNodeJsStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalNodeJsStub.calledWithExactly('handler', 'hello', {}, undefined)
        ).to.be.equal(true);
      }));

    describe('for different handler paths', () => {
      [
        { path: 'handler.hello', expected: 'handler' },
        { path: '.build/handler.hello', expected: '.build/handler' },
      ].forEach(item => {
        it(`should call invokeLocalNodeJs for any node.js runtime version for ${item.path}`, () => {
          awsInvokeLocal.options.functionObj.handler = item.path;

          awsInvokeLocal.options.functionObj.runtime = 'nodejs12.x';
          return awsInvokeLocal.invokeLocal().then(() => {
            expect(invokeLocalNodeJsStub.calledOnce).to.be.equal(true);
            expect(
              invokeLocalNodeJsStub.calledWithExactly(item.expected, 'hello', {}, undefined)
            ).to.be.equal(true);
          });
        });
      });
    });

    it('should call invokeLocalNodeJs with custom context if provided', () => {
      awsInvokeLocal.options.context = 'custom context';
      return awsInvokeLocal.invokeLocal().then(() => {
        expect(invokeLocalNodeJsStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalNodeJsStub.calledWithExactly('handler', 'hello', {}, 'custom context')
        ).to.be.equal(true);
      });
    });

    it('should call invokeLocalPython when python2.7 runtime is set', () => {
      awsInvokeLocal.options.functionObj.runtime = 'python2.7';
      return awsInvokeLocal.invokeLocal().then(() => {
        // NOTE: this is important so that tests on Windows won't fail
        const runtime = process.platform === 'win32' ? 'python.exe' : 'python2.7';
        expect(invokeLocalPythonStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalPythonStub.calledWithExactly(runtime, 'handler', 'hello', {}, undefined)
        ).to.be.equal(true);
      });
    });

    it('should call invokeLocalJava when java8 runtime is set', () => {
      awsInvokeLocal.options.functionObj.runtime = 'java8';
      return awsInvokeLocal.invokeLocal().then(() => {
        expect(invokeLocalJavaStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalJavaStub.calledWithExactly(
            'java',
            'handler.hello',
            'handleRequest',
            undefined,
            {},
            undefined
          )
        ).to.be.equal(true);
      });
    });

    it('should call invokeLocalRuby when ruby2.5 runtime is set', () => {
      awsInvokeLocal.options.functionObj.runtime = 'ruby2.5';
      return awsInvokeLocal.invokeLocal().then(() => {
        // NOTE: this is important so that tests on Windows won't fail
        const runtime = process.platform === 'win32' ? 'ruby.exe' : 'ruby';
        expect(invokeLocalRubyStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalRubyStub.calledWithExactly(runtime, 'handler', 'hello', {}, undefined)
        ).to.be.equal(true);
      });
    });

    it('should call invokeLocalRuby with class/module info when used', () => {
      awsInvokeLocal.options.functionObj.runtime = 'ruby2.5';
      awsInvokeLocal.options.functionObj.handler = 'handler.MyModule::MyClass.hello';
      return awsInvokeLocal.invokeLocal().then(() => {
        // NOTE: this is important so that tests on Windows won't fail
        const runtime = process.platform === 'win32' ? 'ruby.exe' : 'ruby';
        expect(invokeLocalRubyStub.calledOnce).to.be.equal(true);
        expect(
          invokeLocalRubyStub.calledWithExactly(
            runtime,
            'handler',
            'MyModule::MyClass.hello',
            {},
            undefined
          )
        ).to.be.equal(true);
      });
    });

    it('should call invokeLocalDocker if using runtime provided', () => {
      awsInvokeLocal.options.functionObj.runtime = 'provided';
      awsInvokeLocal.options.functionObj.handler = 'handler.foobar';
      return awsInvokeLocal.invokeLocal().then(() => {
        expect(invokeLocalDockerStub.calledOnce).to.be.equal(true);
        expect(invokeLocalDockerStub.calledWithExactly()).to.be.equal(true);
      });
    });

    it('should call invokeLocalDocker if using --docker option with nodejs12.x', () => {
      awsInvokeLocal.options.functionObj.runtime = 'nodejs12.x';
      awsInvokeLocal.options.functionObj.handler = 'handler.foobar';
      awsInvokeLocal.options.docker = true;
      return awsInvokeLocal.invokeLocal().then(() => {
        expect(invokeLocalDockerStub.calledOnce).to.be.equal(true);
        expect(invokeLocalDockerStub.calledWithExactly()).to.be.equal(true);
      });
    });
  });

  describe('#invokeLocalNodeJs', () => {
    beforeEach(() => {
      awsInvokeLocal.options = {
        functionObj: {
          name: '',
        },
      };

      sinon.stub(serverless.cli, 'consoleLog');
    });

    afterEach(() => {
      serverless.cli.consoleLog.restore();
    });

    describe('with sync return value', () => {
      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/handlerWithSuccess', 'withMessageByReturn')
          .then(() => expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"'));
      });
    });

    describe('with done method', () => {
      it('should exit with error exit code', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withErrorByDone');

        expect(process.exitCode).to.be.equal(1);
      });

      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withMessageByDone');

        expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"');
      });
    });

    describe('with Lambda Proxy with application/json response', () => {
      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withMessageByLambdaProxy');

        expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain(
          '{\n    "statusCode": 200,\n    "headers": {\n        "Content-Type": "application/json"\n    },\n    "body": {\n        "result": true,\n        "message": "Whatever"\n    }\n}'
        ); // eslint-disable-line
      });
    });

    describe('context.remainingTimeInMillis', () => {
      it('should become lower over time', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withRemainingTime');

        const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
        expect(remainingTimes.start).to.be.above(remainingTimes.stop);
      });

      it('should start with the timeout value', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.serverless.service.provider.timeout = 5;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withRemainingTime');

        const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
        expect(remainingTimes.start).to.match(/\d+/);
      });

      it('should never become negative', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.serverless.service.provider.timeout = 0.00001;

        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithSuccess', 'withRemainingTime');

        const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
        expect(remainingTimes.stop).to.eql(0);
      });
    });

    describe('with extraServicePath', () => {
      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.options.extraServicePath = 'fixture';

        awsInvokeLocal.invokeLocalNodeJs('handlerWithSuccess', 'withMessageByLambdaProxy');

        expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain(
          '{\n    "statusCode": 200,\n    "headers": {\n        "Content-Type": "application/json"\n    },\n    "body": {\n        "result": true,\n        "message": "Whatever"\n    }\n}'
        ); // eslint-disable-line
      });
    });

    it('should exit with error exit code', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withError');

      expect(process.exitCode).to.be.equal(1);
    });

    it('should log Error instance when called back', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withError');
      const logMessageContent = JSON.parse(stripAnsi(serverless.cli.consoleLog.lastCall.args[0]));

      expect(logMessageContent.errorMessage).to.equal('failed');
      expect(logMessageContent.errorType).to.equal('Error');
      expect(logMessageContent.stackTrace[0]).to.equal('Error: failed');
    });

    it('should log Error object if handler crashes at initialization', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      try {
        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithInitializationError', 'withError');
      } catch (error) {
        if (!error.message.startsWith('Exception encountered when loading')) {
          throw error;
        }
      }

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('Initialization failed');
    });

    it('should log error when called back', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withMessage');

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
    });

    it('should throw when module loading error', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      expect(() =>
        awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithLoadingError', 'anyMethod')
      ).to.throw(/Exception encountered when loading/);
    });
  });

  describe('#invokeLocalNodeJs promise', () => {
    beforeEach(() => {
      awsInvokeLocal.options = {
        functionObj: {
          name: '',
        },
      };

      sinon.stub(serverless.cli, 'consoleLog');
    });

    afterEach(() => {
      serverless.cli.consoleLog.restore();
    });

    describe('with return', () => {
      it('should exit with error exit code', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withError')
          .then(() => {
            expect(process.exitCode).to.be.equal(1);
          });
      });

      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withMessage')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"');
          });
      });
    });

    describe('by context.done', () => {
      it('success should trigger one response', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withMessageByDone')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"');
            const calls = serverless.cli.consoleLog.getCalls().reduce((acc, call) => {
              return call.args[0].includes('Succeed') ? [call].concat(acc) : acc;
            }, []);
            expect(calls.length).to.equal(1);
          });
      });

      it('error should trigger one response', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withErrorByDone')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"failed"');
            expect(process.exitCode).to.be.equal(1);
          });
      });
    });

    describe('by callback method', () => {
      it('should succeed once if succeed if by callback', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withMessageByCallback')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"');
            const calls = serverless.cli.consoleLog.getCalls().reduce((acc, call) => {
              return call.args[0].includes('Succeed') ? [call].concat(acc) : acc;
            }, []);
            expect(calls.length).to.equal(1);
          });
      });
    });

    describe("by callback method even if callback isn't called syncronously", () => {
      it('should succeed once if succeed if by callback', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withMessageAndDelayByCallback')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"Succeed"');
            const calls = serverless.cli.consoleLog.getCalls().reduce((acc, call) => {
              return call.args[0].includes('Succeed') ? [call].concat(acc) : acc;
            }, []);
            expect(calls.length).to.equal(1);
          });
      });
    });

    describe('with Lambda Proxy with application/json response', () => {
      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withMessageByLambdaProxy')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain(
              '{\n    "statusCode": 200,\n    "headers": {\n        "Content-Type": "application/json"\n    },\n    "body": {\n        "result": true,\n        "message": "Whatever"\n    }\n}'
            ); // eslint-disable-line
          });
      });
    });

    describe('context.remainingTimeInMillis', () => {
      it('should become lower over time', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withRemainingTime')
          .then(() => {
            const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
            expect(remainingTimes.start).to.be.above(remainingTimes.stop);
          });
      });

      it('should start with the timeout value', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.serverless.service.provider.timeout = 5;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withRemainingTime')
          .then(() => {
            const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
            expect(remainingTimes.start).to.match(/\d+/);
          });
      });

      it('should never become negative', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.serverless.service.provider.timeout = 0.00001;

        return awsInvokeLocal
          .invokeLocalNodeJs('fixture/asyncHandlerWithSuccess', 'withRemainingTime')
          .then(() => {
            const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
            expect(remainingTimes.stop).to.eql(0);
          });
      });
    });

    describe('with extraServicePath', () => {
      it('should succeed if succeed', () => {
        awsInvokeLocal.serverless.config.servicePath = __dirname;
        awsInvokeLocal.options.extraServicePath = 'fixture';

        return awsInvokeLocal
          .invokeLocalNodeJs('asyncHandlerWithSuccess', 'withMessageByLambdaProxy')
          .then(() => {
            expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain(
              '{\n    "statusCode": 200,\n    "headers": {\n        "Content-Type": "application/json"\n    },\n    "body": {\n        "result": true,\n        "message": "Whatever"\n    }\n}'
            ); // eslint-disable-line
          });
      });
    });

    it('should exit with error exit code', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      return awsInvokeLocal
        .invokeLocalNodeJs('fixture/asyncHandlerWithError', 'withError')
        .then(() => {
          expect(process.exitCode).to.be.equal(1);
        });
    });

    it('should log Error instance when called back', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      return awsInvokeLocal
        .invokeLocalNodeJs('fixture/asyncHandlerWithError', 'withError')
        .then(() => {
          expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
          expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorType": "Error"');
        });
    });

    it('should log error', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      return awsInvokeLocal
        .invokeLocalNodeJs('fixture/asyncHandlerWithError', 'withMessage')
        .then(() => {
          expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
        });
    });

    it('should log error when error is returned', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      return awsInvokeLocal
        .invokeLocalNodeJs('fixture/asyncHandlerWithError', 'returnsError')
        .then(() => {
          expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
        });
    });
  });

  describe('#invokeLocalPython', () => {
    beforeEach(() => {
      awsInvokeLocal.options = {
        functionObj: {
          name: '',
        },
      };

      sinon.stub(serverless.cli, 'consoleLog');
    });

    const afterEachCallback = () => {
      serverless.cli.consoleLog.restore();
    };
    afterEach(afterEachCallback);

    describe('context.remainingTimeInMillis', () => {
      it('should become lower over time', function() {
        // skipping in CI for now due to handler loading issues
        // in the Windows machine on Travis CI
        if (process.env.CI) {
          this.skip();
        }

        awsInvokeLocal.serverless.config.servicePath = __dirname;
        process.chdir(__dirname);

        return awsInvokeLocal
          .invokeLocalPython('python2.7', 'fixture/handler', 'withRemainingTime')
          .then(
            () => {
              log.debug('test target %o', serverless.cli.consoleLog.lastCall.args);
              const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
              expect(remainingTimes.start).to.be.above(remainingTimes.stop);
            },
            error => {
              if (error.code === 'ENOENT' && error.path === 'python2') {
                skipWithNotice(this, 'Python runtime is not installed', afterEachCallback);
              }
              throw error;
            }
          );
      });
    });
  });

  describe('#invokeLocalRuby', () => {
    let curdir;

    beforeEach(() => {
      curdir = process.cwd();
      process.chdir(__dirname);
      awsInvokeLocal.options = {
        functionObj: {
          name: '',
        },
      };

      sinon.stub(serverless.cli, 'consoleLog');
    });

    const afterEachCallback = () => {
      serverless.cli.consoleLog.restore();
      process.chdir(curdir);
    };
    afterEach(afterEachCallback);

    describe('context.remainingTimeInMillis', () => {
      it('should become lower over time', function() {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal.invokeLocalRuby('ruby', 'fixture/handler', 'withRemainingTime').then(
          () => {
            log.debug('test target %o', serverless.cli.consoleLog.lastCall.args);
            const remainingTimes = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
            expect(remainingTimes.start).to.be.above(remainingTimes.stop);
          },
          error => {
            if (error.code === 'ENOENT' && error.path === 'ruby') {
              skipWithNotice(this, 'Ruby runtime is not installed', afterEachCallback);
            }
            throw error;
          }
        );
      });
    });

    describe('calling a class method', () => {
      it('should execute', function() {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal
          .invokeLocalRuby('ruby', 'fixture/handler', 'MyModule::MyClass.my_class_method')
          .then(
            () => {
              log.debug('test target %o', serverless.cli.consoleLog.lastCall.args);
              const result = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
              expect(result.foo).to.eq('bar');
            },
            error => {
              if (error.code === 'ENOENT' && error.path === 'ruby') {
                skipWithNotice(this, 'Ruby runtime is not installed', afterEachCallback);
              }
              throw error;
            }
          );
      });
    });

    describe('context.deadlineMs', () => {
      it('should return deadline', function() {
        awsInvokeLocal.serverless.config.servicePath = __dirname;

        return awsInvokeLocal.invokeLocalRuby('ruby', 'fixture/handler', 'withDeadlineMs').then(
          () => {
            log.debug('test target %o', serverless.cli.consoleLog.lastCall.args);
            const result = JSON.parse(serverless.cli.consoleLog.lastCall.args[0]);
            expect(result.deadlineMs).to.be.closeTo(Date.now() + 6000, 2000);
          },
          error => {
            if (error.code === 'ENOENT' && error.path === 'ruby') {
              skipWithNotice(this, 'Ruby runtime is not installed', afterEachCallback);
            }
            throw error;
          }
        );
      });
    });
  });

  describe('#callJavaBridge()', () => {
    let invokeLocalSpawnStubbed;
    beforeEach(() => {
      AwsInvokeLocal = proxyquire('./index', {
        'get-stdin': stdinStub,
        'child-process-ext/spawn': spawnExtStub,
        'child_process': {
          spawn: spawnStub,
        },
      });
      invokeLocalSpawnStubbed = new AwsInvokeLocal(serverless, {
        stage: 'dev',
        function: 'first',
        functionObj: {
          handler: 'handler.hello',
          name: 'hello',
          timeout: 4,
        },
        data: {},
      });
    });

    it('spawns java process with correct arguments', () =>
      invokeLocalSpawnStubbed
        .callJavaBridge(__dirname, 'com.serverless.Handler', 'handleRequest', '{}')
        .then(() => {
          expect(writeChildStub.calledOnce).to.be.equal(true);
          expect(endChildStub.calledOnce).to.be.equal(true);
          expect(writeChildStub.calledWithExactly('{}')).to.be.equal(true);
        }));
  });

  describe('#invokeLocalJava()', () => {
    let callJavaBridgeStub;
    let bridgePath;

    beforeEach(() =>
      awsInvokeLocal.resolveRuntimeWrapperPath('java/target').then(wrapperPath => {
        bridgePath = wrapperPath;
        fse.mkdirsSync(bridgePath);
        callJavaBridgeStub = sinon.stub(awsInvokeLocal, 'callJavaBridge').resolves();
        awsInvokeLocal.provider.options.stage = 'dev';
        awsInvokeLocal.options = {
          function: 'first',
          functionObj: {
            handler: 'handler.hello',
            name: 'hello',
            timeout: 4,
          },
          data: {},
        };
      })
    );

    afterEach(() => {
      awsInvokeLocal.callJavaBridge.restore();
      fse.removeSync(bridgePath);
    });

    it('should invoke callJavaBridge when bridge is built', () =>
      awsInvokeLocal
        .invokeLocalJava('java', 'com.serverless.Handler', 'handleRequest', __dirname, {})
        .then(() => {
          expect(callJavaBridgeStub.calledOnce).to.be.equal(true);
          expect(
            callJavaBridgeStub.calledWithExactly(
              __dirname,
              'com.serverless.Handler',
              'handleRequest',
              JSON.stringify({
                event: {},
                context: {
                  name: 'hello',
                  version: 'LATEST',
                  logGroupName: '/aws/lambda/hello',
                  timeout: 4,
                },
              })
            )
          ).to.be.equal(true);
        }));

    describe('when attempting to build the Java bridge', () => {
      it("if it's not present yet", () =>
        awsInvokeLocal
          .invokeLocalJava('java', 'com.serverless.Handler', 'handleRequest', __dirname, {})
          .then(() => {
            expect(callJavaBridgeStub.calledOnce).to.be.equal(true);
            expect(
              callJavaBridgeStub.calledWithExactly(
                __dirname,
                'com.serverless.Handler',
                'handleRequest',
                JSON.stringify({
                  event: {},
                  context: {
                    name: 'hello',
                    version: 'LATEST',
                    logGroupName: '/aws/lambda/hello',
                    timeout: 4,
                  },
                })
              )
            ).to.be.equal(true);
          }));
    });
  });

  describe('#invokeLocalDocker()', () => {
    let pluginMangerSpawnStub;
    let pluginMangerSpawnPackageStub;
    beforeEach(() => {
      awsInvokeLocal.provider.options.stage = 'dev';
      awsInvokeLocal.options = {
        'stage': 'dev',
        'function': 'first',
        'functionObj': {
          handler: 'handler.hello',
          name: 'hello',
          timeout: 4,
          runtime: 'nodejs12.x',
          environment: {
            functionVar: 'functionValue',
          },
        },
        'data': {},
        'env': 'commandLineEnvVar=commandLineEnvVarValue',
        'docker-arg': '-p 9292:9292',
      };
      serverless.service.provider.environment = {
        providerVar: 'providerValue',
      };
      pluginMangerSpawnStub = sinon.stub(serverless.pluginManager, 'spawn');
      pluginMangerSpawnPackageStub = pluginMangerSpawnStub.withArgs('package').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
      fse.removeSync('.serverless');
    });

    it('calls docker with packaged artifact', () =>
      awsInvokeLocal.invokeLocalDocker().then(() => {
        const dockerfilePath = path.join('.serverless', 'invokeLocal', 'nodejs12.x', 'Dockerfile');

        expect(pluginMangerSpawnPackageStub.calledOnce).to.equal(true);
        expect(spawnExtStub.getCall(0).args).to.deep.equal(['docker', ['version']]);
        expect(spawnExtStub.getCall(1).args).to.deep.equal([
          'docker',
          ['images', '-q', 'lambci/lambda:nodejs12.x'],
        ]);
        expect(spawnExtStub.getCall(2).args).to.deep.equal([
          'docker',
          ['build', '-t', 'sls-docker-nodejs12.x', 'servicePath', '-f', dockerfilePath],
        ]);
        expect(spawnExtStub.getCall(3).args).to.deep.equal([
          'docker',
          [
            'run',
            '--rm',
            '-v',
            'servicePath:/var/task:ro,delegated',
            '--env',
            'AWS_REGION=us-east-1',
            '--env',
            'AWS_DEFAULT_REGION=us-east-1',
            '--env',
            'AWS_LAMBDA_LOG_GROUP_NAME=/aws/lambda/hello',
            '--env',
            'AWS_LAMBDA_FUNCTION_NAME=hello',
            '--env',
            'AWS_LAMBDA_FUNCTION_MEMORY_SIZE=1024',
            '--env',
            'AWS_ACCESS_KEY_ID=foo',
            '--env',
            'AWS_SECRET_ACCESS_KEY=bar',
            '--env',
            'providerVar=providerValue',
            '--env',
            'functionVar=functionValue',
            '--env',
            'commandLineEnvVar=commandLineEnvVarValue',
            '-p',
            '9292:9292',
            'sls-docker-nodejs12.x',
            'handler.hello',
            '{}',
          ],
        ]);
      }));
  });

  describe('#getEnvVarsFromOptions', () => {
    it('returns empty object when env option is not set', () => {
      delete awsInvokeLocal.options.env;

      const envVarsFromOptions = awsInvokeLocal.getEnvVarsFromOptions();

      expect(envVarsFromOptions).to.be.eql({});
    });

    it('returns empty object when env option empty', () => {
      awsInvokeLocal.options.env = '';

      const envVarsFromOptions = awsInvokeLocal.getEnvVarsFromOptions();

      expect(envVarsFromOptions).to.be.eql({});
    });

    it('returns key value for option separated by =', () => {
      awsInvokeLocal.options.env = 'SOME_ENV_VAR=some-value';

      const envVarsFromOptions = awsInvokeLocal.getEnvVarsFromOptions();

      expect(envVarsFromOptions).to.be.eql({ SOME_ENV_VAR: 'some-value' });
    });

    it('returns key with empty value for option without =', () => {
      awsInvokeLocal.options.env = 'SOME_ENV_VAR';

      const envVarsFromOptions = awsInvokeLocal.getEnvVarsFromOptions();

      expect(envVarsFromOptions).to.be.eql({ SOME_ENV_VAR: '' });
    });

    it('returns key with single value for option multiple =s', () => {
      awsInvokeLocal.options.env = 'SOME_ENV_VAR=value1=value2';

      const envVarsFromOptions = awsInvokeLocal.getEnvVarsFromOptions();

      expect(envVarsFromOptions).to.be.eql({ SOME_ENV_VAR: 'value1=value2' });
    });
  });

  describe('#getDockerArgsFromOptions', () => {
    it('returns empty list when docker-arg option is absent', () => {
      delete awsInvokeLocal.options['docker-arg'];

      const dockerArgsFromOptions = awsInvokeLocal.getDockerArgsFromOptions();

      expect(dockerArgsFromOptions).to.eql([]);
    });

    it('returns arg split by space when single docker-arg option is present', () => {
      awsInvokeLocal.options['docker-arg'] = '-p 9229:9229';

      const dockerArgsFromOptions = awsInvokeLocal.getDockerArgsFromOptions();

      expect(dockerArgsFromOptions).to.eql(['-p', '9229:9229']);
    });

    it('returns args split by space when multiple docker-arg options are present', () => {
      awsInvokeLocal.options['docker-arg'] = ['-p 9229:9229', '-v /var/logs:/host-var-logs'];

      const dockerArgsFromOptions = awsInvokeLocal.getDockerArgsFromOptions();

      expect(dockerArgsFromOptions).to.eql(['-p', '9229:9229', '-v', '/var/logs:/host-var-logs']);
    });

    it('returns arg split only by first space when docker-arg option has multiple space', () => {
      awsInvokeLocal.options['docker-arg'] = '-v /My Docs:/docs';

      const dockerArgsFromOptions = awsInvokeLocal.getDockerArgsFromOptions();

      expect(dockerArgsFromOptions).to.eql(['-v', '/My Docs:/docs']);
    });
  });
});
