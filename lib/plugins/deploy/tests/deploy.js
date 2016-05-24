'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Deploy = require('../deploy');
const Serverless = require('../../../Serverless');
const serverless = new Serverless();

describe('Deploy', () => {
  let deploy;
  let configStub;
  let codeStub;

  beforeEach(() => {
    deploy = new Deploy(serverless);
    configStub = sinon.stub(deploy.Lambda, 'updateFunctionConfigurationPromised');
    codeStub = sinon.stub(deploy.Lambda, 'updateFunctionCodePromised');
    serverless.service.service = 'myService';
    serverless.service.functions = {
      create: {
        handler: 'users.create',
        description: 'fake function',
        memory_size: 512,
        timeout: 6,
      },
      list: {
        handler: 'users.list',
        description: 'fake function',
        memory_size: 1024,
        timeout: 6,
      },
    };
  });

  afterEach(() => {
    deploy.Lambda.updateFunctionConfigurationPromised.restore();
    deploy.Lambda.updateFunctionCodePromised.restore();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty);

    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty);
  });

  describe('#deploy()', () => {
    it('should update lambda', () => {
      deploy.deploy().then(() => {
        // both config calls
        expect(configStub.calledTwice).to.be.equal(true);

        // first config call args
        expect(configStub.args[0][0].FunctionName)
          .to.be.equal('myService-create');
        expect(configStub.args[0][0].Description)
          .to.be.equal(serverless.service.functions.create.description);
        expect(configStub.args[0][0].Handler)
          .to.be.equal(serverless.service.functions.create.handler);
        expect(configStub.args[0][0].MemorySize)
          .to.be.equal(serverless.service.functions.create.memory_size);
        expect(configStub.args[0][0].Timeout)
          .to.be.equal(serverless.service.functions.create.timeout);

        // second config call args
        expect(configStub.args[1][0].FunctionName)
          .to.be.equal('myService-list');
        expect(configStub.args[1][0].Description)
          .to.be.equal(serverless.service.functions.list.description);
        expect(configStub.args[1][0].Handler)
          .to.be.equal(serverless.service.functions.list.handler);
        expect(configStub.args[1][0].MemorySize)
          .to.be.equal(serverless.service.functions.list.memory_size);
        expect(configStub.args[1][0].Timeout)
          .to.be.equal(serverless.service.functions.list.timeout);

        // both code calls
        expect(codeStub.calledTwice).to.be.equal(true);

        // first code call args
        expect(codeStub.args[0][0].FunctionName)
          .to.be.equal('myService-create');
        expect(typeof codeStub.args[0][0].ZipFile)
          .to.not.be.equal('undefined');

        // second code call args
        expect(codeStub.args[1][0].FunctionName)
          .to.be.equal('myService-list');
        expect(typeof codeStub.args[1][0].ZipFile)
          .to.not.be.equal('undefined');
      });
    });
  });
});
