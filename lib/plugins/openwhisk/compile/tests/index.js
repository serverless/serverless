'use strict';

const expect = require('chai').expect;
const chaiAsPromised = require("chai-as-promised");

require('chai').use(chaiAsPromised);

const sinon = require('sinon');
const fs = require('fs-extra');
const OpenWhiskCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

describe('OpenWhiskCompileFunctions', () => {
  let serverless;
  let openwhiskCompileFunctions;
  let sandbox

  const openwhiskResourcesMockObject = {
    first: {
      name: 'first',
      namespace: '',
      action: {
        exec: { kind: 'nodejs:default', code: 'function main() {};'} 
      }
    },
    second: {
      name: 'second',
      namespace: '',
      action: {
        exec: { kind: 'nodejs:default', code: 'function main() {};'} 
      }
    }
  };

  beforeEach(() => {
    serverless = new Serverless();
    sandbox = sinon.sandbox.create();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskCompileFunctions = new OpenWhiskCompileFunctions(serverless, options);
    serverless.service.resources = {};
    serverless.service.service = 'serviceName';
    openwhiskCompileFunctions.setup()
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#setup()', () => {
    it('should create empty in-memory function store', () => {
      openwhiskCompileFunctions.serverless.service.resources = {}
      openwhiskCompileFunctions.setup()
      expect(openwhiskCompileFunctions.serverless.service.resources.openwhisk).to.have.property('functions')
    })
  });

  describe('#convertHandlerToPath()', () => {
    it('should return javascript file path for handler string', () => {
      expect(openwhiskCompileFunctions.convertHandlerToPath("handler.function")).to.equal('handler.js')
      expect(openwhiskCompileFunctions.convertHandlerToPath("dir/handler.function")).to.equal('dir/handler.js')
    })
  });

  describe('#readFunctionSource()', () => {
    it('should return Promise that errors if readFile fails', () => {
      sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
        cb(true);
      });
      expect(openwhiskCompileFunctions.readFunctionSource('missing.handler')).to.be.rejected;
    });
    it('should return Promise that resolves with file contents', () => {
      const contents = "some file contents"
      sandbox.stub(fs, 'readFile', (path, encoding, cb) => {
        expect(path).to.equal('handler.js')
        expect(encoding).to.equal('utf8')
        cb(null, contents);
      });
      return expect(openwhiskCompileFunctions.readFunctionSource('handler.function')).to.eventually.equal(contents);
    });
  });

  describe('#compileFunction()', () => {
    it('should return default function instance for handler', () => {
      const fileContents = "some file contents"
      const handler = "handler.function"

      const newFunction = {
        name: 'serviceName_functionName',
        nameSpace: "namespace_dev",
        action: {
          exec: { kind: 'nodejs:default', code: fileContents},
          limits: { timeout: 60*1000, memory: 256}
        },
      }
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler)
        return Promise.resolve(fileContents)
      });
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.baseNameSpace = "namespace"
      return expect(openwhiskCompileFunctions.compileFunction('functionName', {handler: handler})).to.eventually.deep.equal(newFunction);
    });

    it('should allow manifest parameters to override defaults', () => {
      const fileContents = "some file contents"
      const handler = "handler.function"
      const name = 'testing_name'
      const namespace = 'testing_namespace'
      const mem = 100, timeout = 10, runtime = "runtime"

      const newFunction = {
        name: 'testing_name',
        nameSpace: "testing_namespace",
        action: {
          exec: { kind: runtime, code: fileContents},
          limits: { timeout: timeout * 1000, memory: mem}
        }
      }
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler)
        return Promise.resolve(fileContents)
      });
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.baseNameSpace = "namespace"
      return expect(
        openwhiskCompileFunctions.compileFunction('functionName', {
          name: name, 
          namespace: namespace,
          timeout: timeout,
          memory: mem,
          runtime: runtime,
          handler: handler
        })).to.eventually.deep.equal(newFunction);
    });

    it('should allow service default parameters to override defaults', () => {
      const fileContents = "some file contents"
      const handler = "handler.function"
      const name = 'testing_name'
      const namespace = 'testing_namespace'
      const mem = 100, timeout = 10, runtime = "runtime"

      const newFunction = {
        name: 'testing_name',
        nameSpace: "testing_namespace",
        action: {
          exec: { kind: runtime, code: fileContents},
          limits: { timeout: timeout * 1000, memory: mem}
        }
      }
      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler)
        return Promise.resolve(fileContents)
      });
      openwhiskCompileFunctions.serverless.service.resources.openwhisk.baseNameSpace = "namespace"
      openwhiskCompileFunctions.serverless.service.defaults = {memory: mem, timeout: timeout, runtime: runtime}
      return expect(
        openwhiskCompileFunctions.compileFunction('functionName', {
          name: name, 
          namespace: namespace,
          handler: handler
        })).to.eventually.deep.equal(newFunction);
    });
  });

  describe('#compileFunctions()', () => {
    it('should throw an error if the resource section is not available', () => {
      openwhiskCompileFunctions.serverless.service.resources = {}
      expect(() => openwhiskCompileFunctions.compileFunctions()).to.throw(Error, /plugin needs access/);
    });

    it('should throw an error if function definition is missing a handler', () => {
      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => {
        return ['service_name'];
      });

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', () => {
        return {};
      });

      expect(() => openwhiskCompileFunctions.compileFunctions()).to.throw(Error, /Missing "handler"/);
    });

    it('should throw an error if unable to read function handler file', () => {
      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => {
        return ['service_name'];
      });

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', () => {
        return {handler: "missing.handler"};
      });

      sandbox.stub(openwhiskCompileFunctions, 'compileFunction', () => Promise.reject())
      return expect(openwhiskCompileFunctions.compileFunctions()).to.be.rejected;
    });

    it('should create corresponding function resources', () => {
      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => {
        return Object.keys(openwhiskResourcesMockObject)
      });

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', (name) => {
        return {handler: `${name}.handler`};
      });

      sandbox.stub(openwhiskCompileFunctions, 'compileFunction', (name, obj) => Promise.resolve(openwhiskResourcesMockObject[name]))

      return openwhiskCompileFunctions.compileFunctions().then(() => {
        expect(openwhiskCompileFunctions.serverless.service.resources.openwhisk.functions)
          .to.deep.equal(openwhiskResourcesMockObject);
      });
    });
  });
});
