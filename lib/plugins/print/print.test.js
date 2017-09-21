'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Serverless = require('../../Serverless');
const CLI = require('../../classes/CLI');


describe('Print', () => {
  let print;
  let serverless;
  let getServerlessConfigFileStub;
  let consoleLogStub;

  beforeEach(() => {
    getServerlessConfigFileStub = sinon.stub();
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
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns(true);
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
  })

  describe('#constructor()', () => {
    it('should have commands', () => expect(print.commands).to.be.not.empty);
  });

  it('should print standard config', () => {
    getServerlessConfigFileStub.resolves({
      service: 'my-service',
      provider: {
        name: 'aws'
      }
    })

    print.print();

    expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
    expect(consoleLogStub.called).to.equal(true);
  });

});
