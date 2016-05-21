'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Deploy = require('../deploy');
const BbPromise = require('bluebird');
const Serverless = require('../../../Serverless');



describe('Deploy', () => {
  let deploy;
  let codeStub;

  beforeEach(() => {
    const S = new Serverless();
    deploy = new Deploy(S);
    codeStub = sinon.stub(deploy.Lambda, 'updateFunctionCodePromised')
      .returns(BbPromise.resolve());
    S.instances.service.service = 'myService';
    S.instances.service.functions = {
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
    deploy.Lambda.updateFunctionCodePromised.restore();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty);

    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty);
  });

  describe('#deploy()', () => {
    it('should deploy lambda', () => {
      deploy.deploy();
      expect(codeStub.calledTwice).to.be.equal(true);
      expect(codeStub.args[0][0].FunctionName).to.be.equal('myService-create');
      expect(typeof codeStub.args[0][0].ZipFile).to.not.be.equal('undefined');
      expect(codeStub.args[1][0].FunctionName).to.be.equal('myService-list');
      expect(typeof codeStub.args[1][0].ZipFile).to.not.be.equal('undefined');
    });
  });
});
