'use strict';

const expect = require('chai').expect;
const chaiAsPromised = require('chai-as-promised');

require('chai').use(chaiAsPromised);

const sinon = require('sinon');
const fs = require('fs-extra');
const OpenWhiskCompileFunctions = require('../index');
const Serverless = require('../../../../Serverless');

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
    serverless.service.resources = {
      openwhisk: {
        namespace: '',
        apihost: '',
        auth: '',
      },
    };

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

  describe('#compileFunction()', () => {
    it('should return default function instance for handler', () => {
      const fileContents = 'some file contents';
      const handler = 'handler.function';

      const newFunction = {
        actionName: 'serviceName_functionName',
        namespace: 'namespace',
        action: {
          exec: { kind: 'nodejs:default', code: fileContents },
          limits: { timeout: 60 * 1000, memory: 256 },
          parameters: [],
        },
      };
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler);
        return Promise.resolve(fileContents);
      });
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.namespace = 'namespace';
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
      const parameters = {
        foo: 'bar',
      };

      const newFunction = {
        actionName: name,
        namespace: 'testing_namespace',
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
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.namespace = 'namespace';
      return expect(
        openwhiskCompileFunctions.compileFunction('functionName', {
          actionName: name,
          namespace,
          timeout,
          memory: mem,
          runtime,
          handler,
          parameters,
        })).to.eventually.deep.equal(newFunction);
    });

    it('should allow service default parameters to override defaults', () => {
      const fileContents = 'some file contents';
      const handler = 'handler.function';
      const name = 'serviceName_functionName';
      const namespace = 'testing_namespace';
      const mem = 100;
      const timeout = 10;
      const runtime = 'runtime';

      const newFunction = {
        actionName: name,
        namespace: 'testing_namespace',
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
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.namespace = 'namespace';
      openwhiskCompileFunctions.serverless.service.defaults = {
        memory: mem, timeout, runtime,
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
      openwhiskCompileFunctions.serverless.service.resources = {};
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
      const f = openwhiskCompileFunctions.serverless.service.resources.openwhisk.functions;

      return openwhiskCompileFunctions.compileFunctions().then(
        () => expect(f).to.deep.equal(openwhiskResourcesMockObject)
      );
    });
  });
});
