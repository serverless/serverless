'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Serverless = require('../../Serverless');
const CLI = require('../../classes/CLI');
const YAML = require('js-yaml');


describe('Print', () => {
  let print;
  let serverless;
  let getServerlessConfigFileStub;
  let consoleLogSpy;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    consoleLogSpy = sandbox.spy(console, 'log');
    getServerlessConfigFileStub = sandbox.stub();
    const printPlugin = proxyquire('./print.js', {
      '../../utils/getServerlessConfigFile': getServerlessConfigFileStub,
    });
    serverless = new Serverless();
    serverless.processedInput = {
      commands: [ 'print' ],
      options: { stage: undefined, region: undefined }
    }
    serverless.cli = new CLI(serverless);
    print = new printPlugin(serverless);
  });

  afterEach(() => {
    consoleLogSpy.restore();
  })

  it('should print standard config', () => {
    const conf = {
      service: 'my-service',
      provider: {
        name: 'aws'
      }
    }
    getServerlessConfigFileStub.resolves(conf)

    print.print().then(() => {
      const message = consoleLogSpy.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(console.log.calledOnce).to.equal(true);
      expect(message).to.have.string(YAML.dump(conf));
    })
  });

});
