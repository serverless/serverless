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
        exec: { kind: 'nodejs', code: 'function main() {};'} 
      }
    },
    second: {
      name: 'second',
      namespace: '',
      action: {
        exec: { kind: 'nodejs', code: 'function main() {};'} 
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
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#setup()', () => {
    it('should create empty in-memory function store', () => {
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
      expect(openwhiskCompileFunctions.readFunctionSource('handler.function')).to.eventually.equal(contents);
    });
  });

  describe('#compileFunction()', () => {
    it('should return default function instance for handler', () => {
      const fileContents = "some file contents"
      const handler = "handler.function"

      const newFunction = {
        name: 'serviceName',
        nameSpace: "",
        action: {
          exec: { kind: 'nodejs', code: fileContents} 
        }
      }

      sandbox.stub(openwhiskCompileFunctions, 'readFunctionSource', (functionHandler) => {
        expect(functionHandler).to.equal(handler)
        return Promise.resolve(fileContents)
      });
      expect(openwhiskCompileFunctions.compileFunction(newFunction.name, {handler: handler})).to.eventually.equal(newFunction);
    });
  });

  describe('#compileFunctions()', () => {
    it('should throw an error if the resource section is not available', () => {
      expect(() => openwhiskCompileFunctions.compileFunctions()).to.throw(Error, /plugin needs access/);
    });

    it('should throw an error if function definition is missing a handler', () => {
      openwhiskCompileFunctions.setup()
      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getAllFunctions', () => {
        return ['service_name'];
      });

      sandbox.stub(openwhiskCompileFunctions.serverless.service, 'getFunction', () => {
        return {};
      });

      expect(() => openwhiskCompileFunctions.compileFunctions()).to.throw(Error, /Missing "handler"/);
    });

    it('should throw an error if unable to read function handler file', () => {
      openwhiskCompileFunctions.setup()
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

      openwhiskCompileFunctions.setup()
      return openwhiskCompileFunctions.compileFunctions().then(() => {
        expect(openwhiskCompileFunctions.serverless.service.resources.openwhisk.functions)
          .to.deep.equal(openwhiskResourcesMockObject);
      });
    });
  });
});
