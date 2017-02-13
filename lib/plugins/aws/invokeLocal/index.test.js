'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const childProcess = require('child_process');
const AwsInvokeLocal = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const BbPromise = require('bluebird');
const testUtils = require('../../../../tests/utils');

describe('AwsInvokeLocal', () => {
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless));
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const awsInvokeLocal = new AwsInvokeLocal(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvokeLocal.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsInvokeLocal.provider).to.be.instanceof(AwsProvider));

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsInvokeLocal, 'extendedValidate').returns(BbPromise.resolve());
      const loadEnvVarsStub = sinon
        .stub(awsInvokeLocal, 'loadEnvVars').returns(BbPromise.resolve());
      const invokeLocalStub = sinon
        .stub(awsInvokeLocal, 'invokeLocal').returns(BbPromise.resolve());


      return awsInvokeLocal.hooks['invoke:local:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(loadEnvVarsStub.calledAfter(validateStub)).to.be.equal(true);
        expect(invokeLocalStub.calledAfter(loadEnvVarsStub)).to.be.equal(true);

        awsInvokeLocal.extendedValidate.restore();
        awsInvokeLocal.loadEnvVars.restore();
        awsInvokeLocal.invokeLocal.restore();
      });
    });

    it('should set an empty options object if no options are given', () => {
      const awsInvokeWithEmptyOptions = new AwsInvokeLocal(serverless);

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
      awsInvokeLocal.options.data = null;
      awsInvokeLocal.options.path = false;
    });

    it('should not throw error when there are no input data', () => {
      awsInvokeLocal.options.data = undefined;

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.equal('');
      });
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsInvokeLocal.extendedValidate()).to.throw(Error);
    });

    it('should keep data if it is a simple string', () => {
      awsInvokeLocal.options.data = 'simple-string';

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.equal('simple-string');
      });
    });

    it('should parse data if it is a json string', () => {
      awsInvokeLocal.options.data = '{"key": "value"}';

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal({ key: 'value' });
      });
    });

    it('it should parse file if relative file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      awsInvokeLocal.options.path = 'data.json';

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal(data);
      });
    });

    it('it should parse file if absolute file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        event: {
          testProp: 'testValue',
        },
      };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      awsInvokeLocal.options.path = dataFile;

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal(data);
      });
    });

    it('it should parse a yaml file if file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const yamlContent = 'event: data';

      serverless.utils.writeFileSync(path
          .join(serverless.config.servicePath, 'data.yml'), yamlContent);
      awsInvokeLocal.options.path = 'data.yml';

      return awsInvokeLocal.extendedValidate().then(() => {
        expect(awsInvokeLocal.options.data).to.deep.equal({ event: 'data' });
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => awsInvokeLocal.extendedValidate()).to.throw(Error);
    });

    it('it should reject error if file path does not exist', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      awsInvokeLocal.options.path = 'some/path';

      return awsInvokeLocal.extendedValidate().catch((err) => {
        expect(err).to.be.instanceOf(Error);
      });
    });

    it('should resolve if path is not given', (done) => {
      awsInvokeLocal.options.path = false;

      awsInvokeLocal.extendedValidate().then(() => done());
    });
  });

  describe('#loadEnvVars()', () => {
    beforeEach(() => {
      serverless.config.servicePath = true;
      serverless.service.provider = {
        environment: {
          providerVar: 'providerValue',
        },
      };

      awsInvokeLocal.options = {
        region: 'us-east-1',
        functionObj: {
          name: 'serviceName-dev-hello',
          environment: {
            functionVar: 'functionValue',
          },
        },
      };
    });

    it('it should load provider env vars', () => awsInvokeLocal
      .loadEnvVars().then(() => {
        expect(process.env.providerVar).to.be.equal('providerValue');
      })
    );

    it('it should load function env vars', () => awsInvokeLocal
      .loadEnvVars().then(() => {
        expect(process.env.functionVar).to.be.equal('functionValue');
      })
    );

    it('it should load default lambda env vars', () => awsInvokeLocal
      .loadEnvVars().then(() => {
        expect(process.env.PATH)
          .to.equal('/usr/local/lib64/node-v4.3.x/bin:/usr/local/bin:/usr/bin/:/bin');
        expect(process.env.LANG).to.equal('en_US.UTF-8');
        expect(process.env.LD_LIBRARY_PATH)
          .to.equal('/usr/local/lib64/node-v4.3.x/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib'); // eslint-disable-line max-len
        expect(process.env.LAMBDA_TASK_ROOT).to.equal('/var/task');
        expect(process.env.LAMBDA_RUNTIME_DIR).to.equal('/var/runtime');
        expect(process.env.AWS_REGION).to.equal('us-east-1');
        expect(process.env.AWS_LAMBDA_LOG_GROUP_NAME).to.equal('/aws/lambda/serviceName-dev-hello');
        expect(process.env.AWS_LAMBDA_LOG_STREAM_NAME)
          .to.equal('2016/12/02/[$LATEST]f77ff5e4026c45bda9a9ebcec6bc9cad');
        expect(process.env.AWS_LAMBDA_FUNCTION_NAME).to.equal('serviceName-dev-hello');
        expect(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).to.equal('1024');
        expect(process.env.AWS_LAMBDA_FUNCTION_VERSION).to.equal('$LATEST');
        expect(process.env.NODE_PATH).to.equal('/var/runtime:/var/task:/var/runtime/node_modules');
      })
    );

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

    beforeEach(() => {
      invokeLocalNodeJsStub =
        sinon.stub(awsInvokeLocal, 'invokeLocalNodeJs').returns(BbPromise.resolve());
      invokeLocalPythonStub =
        sinon.stub(awsInvokeLocal, 'invokeLocalPython').returns(BbPromise.resolve());

      awsInvokeLocal.serverless.service.service = 'new-service';
      awsInvokeLocal.options = {
        stage: 'dev',
        function: 'first',
        functionObj: {
          handler: 'handler.hello',
          name: 'hello',
        },
        data: {},
      };
    });

    afterEach(() => {
      invokeLocalNodeJsStub.restore();
      invokeLocalPythonStub.restore();
    });

    it('should call invokeLocalNodeJs when no runtime is set', () => awsInvokeLocal.invokeLocal()
      .then(() => {
        expect(invokeLocalNodeJsStub.calledOnce).to.be.equal(true);
        expect(invokeLocalNodeJsStub.calledWithExactly(
          'handler',
          'hello',
          {}
        )).to.be.equal(true);
        awsInvokeLocal.invokeLocalNodeJs.restore();
      })
    );

    it('should call invokeLocalPython when python2.7 runtime is set', () => {
      awsInvokeLocal.options.functionObj.runtime = 'python2.7';
      awsInvokeLocal.invokeLocal()
        .then(() => {
          expect(invokeLocalPythonStub.calledOnce).to.be.equal(true);
          expect(invokeLocalPythonStub.calledWithExactly(
                'handler',
                'hello',
                {}
                )).to.be.equal(true);
          awsInvokeLocal.invokeLocalPython.restore();
        });
      delete awsInvokeLocal.options.functionObj.runtime;
    });

    it('throw error when using runtime other than Node.js or Python', () => {
      awsInvokeLocal.options.functionObj.runtime = 'java8';
      expect(() => awsInvokeLocal.invokeLocal()).to.throw(Error);
      delete awsInvokeLocal.options.functionObj.runtime;
    });
  });

  describe('#invokeLocalPython', () => {
    beforeEach(() => {
      // Process spawning
      this.process = {
        on: () => {},
        stdout: {
          on: () => {},
        },
        stderr: {
          on: () => {},
        },
        stdin: {
          write: () => {},
          end: () => {},
        },
      };
      sinon.stub(this.process, 'on');
      sinon.stub(this.process.stdout, 'on');
      sinon.stub(this.process.stderr, 'on');
      sinon.stub(this.process.stdin, 'write');
      sinon.stub(this.process.stdin, 'end');

      sinon.stub(childProcess, 'spawn').returns(this.process);

      // Serverless
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog');
    });

    afterEach(() => {
      childProcess.spawn.restore();

      serverless.cli.consoleLog.restore();
    });

    it('should spawn the process', () => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name', 'in-data');

      expect(childProcess.spawn.callCount).to.be.equal(1);

      const expectedPath = path.join(__dirname, 'invoke.py');
      const expectedArgs = ['handler-path', 'handler-name'];
      const expectedOptions = { env: process.env };

      expect(childProcess.spawn.firstCall.args[0]).to.be.equal(expectedPath);
      expect(childProcess.spawn.firstCall.args[1]).to.be.eql(expectedArgs);
      expect(childProcess.spawn.firstCall.args[2]).to.be.eql(expectedOptions);
    });

    it('should write the input data', () => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name', { foo: 'bar' });

      expect(this.process.stdin.write.callCount).to.be.equal(1);
      expect(this.process.stdin.write.lastCall.args[0]).to.be.equal('{"foo":"bar"}');
      expect(this.process.stdin.end.callCount).to.be.equal(1);
    });

    it('should be ok with the empty input data', () => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name');

      expect(this.process.stdin.write.callCount).to.be.equal(1);
      expect(this.process.stdin.write.lastCall.args[0]).to.be.equal('{}');
      expect(this.process.stdin.end.callCount).to.be.equal(1);
    });

    it('should capture out stream', () => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name', 'in-data');

      expect(this.process.stdout.on.callCount).to.be.equal(1);
      expect(this.process.stdout.on.lastCall.args[0]).to.be.equal('data');
      expect(this.process.stdout.on.lastCall.args[1]).to.be.a('Function');

      // Test the output proxying
      expect(serverless.cli.consoleLog.callCount).to.be.equal(0);

      const funcOnDataOut = this.process.stdout.on.lastCall.args[1];
      funcOnDataOut('data-out-1');
      funcOnDataOut('data-out-2');

      expect(serverless.cli.consoleLog.callCount).to.be.equal(2);
      expect(serverless.cli.consoleLog.firstCall.args[0]).to.be.equal('data-out-1');
      expect(serverless.cli.consoleLog.secondCall.args[0]).to.be.equal('data-out-2');
    });

    it('should capture error stream', () => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name', 'in-data');

      expect(this.process.stderr.on.callCount).to.be.equal(1);
      expect(this.process.stderr.on.lastCall.args[0]).to.be.equal('data');
      expect(this.process.stderr.on.lastCall.args[1]).to.be.a('Function');

      // Test the output proxying
      expect(serverless.cli.consoleLog.callCount).to.be.equal(0);

      const funcOnDataOut = this.process.stderr.on.lastCall.args[1];
      funcOnDataOut('error-out-1');
      funcOnDataOut('error-out-2');

      expect(serverless.cli.consoleLog.callCount).to.be.equal(2);
      expect(serverless.cli.consoleLog.firstCall.args[0]).to.be.equal('error-out-1');
      expect(serverless.cli.consoleLog.secondCall.args[0]).to.be.equal('error-out-2');
    });

    it('should react on process finish', (done) => {
      awsInvokeLocal.invokeLocalPython('handler-path', 'handler-name', 'in-data')
        .then(done);

      // Should provide callback to listen for the process finish
      expect(this.process.on.callCount).to.be.equal(1);
      expect(this.process.on.lastCall.args[0]).to.be.equal('close');
      expect(this.process.on.lastCall.args[1]).to.be.a('Function');

      const funcOnProcessFinish = this.process.on.lastCall.args[1];
      funcOnProcessFinish();
    });
  });

  describe('#invokeLocalNodeJs', () => {
    beforeEach(() => {
      awsInvokeLocal.options = {
        functionObj: {
          name: '',
        },
      };

      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog');
    });

    afterEach(() => {
      serverless.cli.consoleLog.restore();
    });

    it('should log the result as JSON', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handler', 'lambda');

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.be.equal('"a result"');
    });

    it('should log the result as JSON via context.succeed()', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handler', 'lambdaViaSucceed');

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.be.equal('"a result"');
    });

    it('should log error via context.fail()', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handler', 'lambdaViaFail');

      expect(process.exitCode).to.be.equal(1);
      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "a result"');
    });

    it('should provide done() and do nothing on its call', () => {
      process.exitCode = 0;
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handler', 'lambdaViaDone');

      expect(process.exitCode).to.be.equal(0);
      expect(serverless.cli.consoleLog.callCount).to.be.equal(0);
    });

    it('should provide timeout to lambda', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handler', 'checkTimeout');

      expect(process.exitCode).to.be.equal(0);
      expect(serverless.cli.consoleLog.lastCall.args[0]).to.be.above(0);
    });

    it('should exit with error exit code', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withError');

      expect(process.exitCode).to.be.equal(1);
    });

    it('should log Error instance when called back', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withError');

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorType": "Error"');
    });

    it('should log error when called back', () => {
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      awsInvokeLocal.invokeLocalNodeJs('fixture/handlerWithError', 'withMessage');

      expect(serverless.cli.consoleLog.lastCall.args[0]).to.contain('"errorMessage": "failed"');
    });

    it('should log error and exit when there is an exception while requiring handler', () => {
      sinon.stub(process, 'exit').throws(new Error('exit was called'));
      awsInvokeLocal.serverless.config.servicePath = __dirname;

      let errPseudoExit;
      try {
        awsInvokeLocal.invokeLocalNodeJs('non-existing-path', 'someMethod');
      } catch (e) {
        errPseudoExit = e;
      }

      expect(serverless.cli.consoleLog.callCount).to.be.equal(1);
      expect(process.exit.callCount).to.be.equal(1);
      expect(errPseudoExit).to.have.property('message', 'exit was called');

      process.exit.restore();
    });
  });
});
