'use strict';

const expect = require('chai').expect;
const chaiAsPromised = require('chai-as-promised');

require('chai').use(chaiAsPromised);

const sinon = require('sinon');
const fs = require('fs-extra');
const OpenWhiskCompileFunctions = require('../index');
const Serverless = require('../../../../../Serverless');

describe('OpenWhiskCompileFunctions', () => {
  let serverless;
  let openwhiskCompileFunctions;
  let sandbox;

  const openwhiskResourcesMockObject = {
    first: {
      actionName: 'first',
      namespace: '',
      action: {
        exec: { kind: 'nodejs:default', code: 'function main() {};' },
      },
    },
    second: {
      actionName: 'second',
      namespace: '',
      action: {
        exec: { kind: 'nodejs:default', code: 'function main() {};' },
      },
    },
  };

  beforeEach(() => {
    serverless = new Serverless();
    sandbox = sinon.sandbox.create();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskCompileFunctions = new OpenWhiskCompileFunctions(serverless, options);
    serverless.service.service = 'serviceName';
    serverless.service.defaults = {
      namespace: '',
      apihost: '',
      auth: '',
    };
    serverless.service.provider = { name: 'openwhisk' };

    serverless.cli = { log: () => {} };

    openwhiskCompileFunctions.setup();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should return Promise that resolves with file contents', () => {
    const contents = 'some file contents';
    sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
      expect(path).to.equal('handler.js');
      expect(encoding).to.equal('utf8');
      cb(null, contents);
    });
    return expect(openwhiskCompileFunctions.readFunctionSource('handler.function'))
      .to.eventually.equal(contents);
  });

  describe('#calculateFunctionNameSpace()', () => {
    it('should return namespace from function object', () => {
      expect(openwhiskCompileFunctions
        .calculateFunctionNameSpace('testing', { namespace: 'testing' })
      ).to.equal('testing');
    });

    it('should return namespace from service provider', () => {
      openwhiskCompileFunctions.serverless.service.provider = { namespace: 'testing' };
      expect(openwhiskCompileFunctions.calculateFunctionNameSpace('testing', {}))
        .to.equal('testing');
    });

    it('should return namespace from environment defaults', () => {
      openwhiskCompileFunctions.serverless.service.provider = {};
      openwhiskCompileFunctions.serverless.service.defaults = { namespace: 'testing' };
      expect(openwhiskCompileFunctions.calculateFunctionNameSpace('testing', {}))
        .to.equal('testing');
    });
  });

  describe('#compileRules()', () => {
    it('should return rules object from events manifest definition', () => {
      const functionName = 'myFunction';
      const nameSpace = 'myNamespace';
      const params = [{ myRule: 'myTrigger' }, { anotherRule: 'anotherTrigger' }];
      const result = {
        myRule: {
          ruleName: 'myRule',
          action: 'myFunction',
          trigger: 'myTrigger',
          namespace: 'myNamespace',
          overwrite: true,
        },
        anotherRule: {
          ruleName: 'anotherRule',
          action: 'myFunction',
          trigger: 'anotherTrigger',
          namespace: 'myNamespace',
          overwrite: true,
        },
      };
      expect(openwhiskCompileFunctions.compileRules(functionName, nameSpace, params))
        .to.deep.equal(result);
    });
  });

  describe('#compileFunction()', () => {
    it('should return default function instance for handler', () => {
      const fileContents = 'some file contents';
      const handler = 'handler.function';

      const newFunction = {
        actionName: 'serviceName_functionName',
        namespace: 'namespace',
        overwrite: true,
        rules: {},
        action: {
          exec: { kind: 'nodejs', code: fileContents },
          limits: { timeout: 60 * 1000, memory: 256 },
          parameters: [],
        },
      };
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler);
        return Promise.resolve(fileContents);
      });
      openwhiskCompileFunctions.serverless.service.provider.namespace = 'namespace';
      return expect(openwhiskCompileFunctions.compileFunction('functionName', {
        handler,
      })).to.eventually.deep.equal(newFunction);
    });

    it('should allow manifest parameters to override defaults', () => {
      const fileContents = 'some file contents';
      const handler = 'handler.function';
      const name = 'serviceName_functionName';
      const namespace = 'testing_namespace';
      const mem = 100;
      const timeout = 10;
      const runtime = 'runtime';
      const overwrite = false;
      const rules = [
        { rule_name: 'trigger_name' },
      ];
      const parameters = {
        foo: 'bar',
      };

      const newFunction = {
        actionName: name,
        namespace: 'testing_namespace',
        overwrite: false,
        rules: {
          rule_name: {
            action: name,
            namespace: 'testing_namespace',
            ruleName: 'rule_name',
            trigger: 'trigger_name',
            overwrite: true,
          },
        },
        action: {
          exec: { kind: runtime, code: fileContents },
          limits: { timeout: timeout * 1000, memory: mem },
          parameters: [
            { key: 'foo', value: 'bar' },
          ],
        },
      };
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler);
        return Promise.resolve(fileContents);
      });
      openwhiskCompileFunctions.serverless.service.defaults.namespace = 'namespace';
      return expect(
        openwhiskCompileFunctions.compileFunction('functionName', {
          actionName: name,
          namespace,
          timeout,
          memory: mem,
          overwrite,
          events: rules,
          runtime,
          handler,
          parameters,
        })).to.eventually.deep.equal(newFunction);
    });

    it('should allow provider default parameters to override defaults', () => {
      const fileContents = 'some file contents';
      const handler = 'handler.function';
      const name = 'serviceName_functionName';
      const namespace = 'testing_namespace';
      const mem = 100;
      const timeout = 10;
      const runtime = 'runtime';
      const overwrite = false;

      const newFunction = {
        actionName: name,
        namespace: 'testing_namespace',
        overwrite: false,
        rules: {},
        action: {
          exec: { kind: runtime, code: fileContents },
          limits: { timeout: timeout * 1000, memory: mem },
          parameters: [],
        },
      };
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler);
        return Promise.resolve(fileContents);
      });
      openwhiskCompileFunctions.serverless.service.provider = {
        memory: mem, timeout, overwrite, namespace: 'namespace', runtime,
      };
      return expect(
        openwhiskCompileFunctions.compileFunction('functionName', {
          actionName: name,
          namespace,
          handler,
        })).to.eventually.deep.equal(newFunction);
    });
  });

  describe('#compileFunctions()', () => {
    it('should throw an error if the resource section is not available', () => {
      openwhiskCompileFunctions.serverless.service.actions = null;
      expect(() => openwhiskCompileFunctions.compileFunctions())
        .to.throw(Error, /Missing Resources section/);
    });

    it('should throw an error if function definition is missing a handler', () => {
      sandbox.stub(
        openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => ['service_name']
      );

      const f = {};

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', () => f);

      expect(() => openwhiskCompileFunctions.compileFunctions())
        .to.throw(Error, /Missing "handler"/);
    });

    it('should throw an error if unable to read function handler file', () => {
      sandbox.stub(
        openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => ['service_name']
      );

      const missing = { handler: 'missing.handler' };

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', () => missing);

      sandbox.stub(openwhiskCompileFunctions, 'compileFunction', () => Promise.reject());
      return expect(openwhiskCompileFunctions.compileFunctions()).to.be.rejected;
    });

    it('should create corresponding function resources', () => {
      const keys = Object.keys(openwhiskResourcesMockObject);
      const handler = function (name) {
        return { handler: `${name}.handler` };
      };
      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => keys);

      sandbox.stub(
        openwhiskCompileFunctions.serverless.service, 'getFunction', name => handler(name)
      );

      const mock = openwhiskResourcesMockObject;
      sandbox.stub(
        openwhiskCompileFunctions, 'compileFunction', name => Promise.resolve(mock[name]));
      const f = openwhiskCompileFunctions.serverless.service.actions;

      return openwhiskCompileFunctions.compileFunctions().then(
        () => expect(f).to.deep.equal(openwhiskResourcesMockObject)
      );
    });
  });
});
