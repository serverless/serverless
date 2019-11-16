'use strict';

const BbPromise = require('bluebird');
const chai = require('chai');
const Deploy = require('./deploy');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('Deploy', () => {
  let deploy;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {};
    deploy = new Deploy(serverless, options);
    deploy.serverless.providers = { validProvider: true };
    deploy.serverless.service.provider.name = 'validProvider';
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty);
    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty);
    it('should work without options', () => {
      const noOptionDeploy = new Deploy(serverless);
      expect(noOptionDeploy)
        .to.have.property('options')
        .to.be.eql({});
    });
  });

  describe('"before:deploy:deploy" hook', () => {
    let spawnStub;
    let spawnPackageStub;
    let spawnDeployFunctionStub;

    beforeEach(() => {
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn');
      spawnPackageStub = spawnStub.withArgs('package').resolves();
      spawnDeployFunctionStub = spawnStub.withArgs('deploy:function').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
    });

    it('should resolve if the package option is set', () => {
      deploy.options.package = false;
      deploy.serverless.service.package.path = 'some_path';

      return expect(deploy.hooks['before:deploy:deploy']()).to.be.fulfilled.then(
        () => expect(spawnPackageStub).to.be.not.called
      );
    });

    it('should resolve if the service package path is set', () => {
      deploy.options.package = 'some_path';
      deploy.serverless.service.package.path = false;

      return expect(deploy.hooks['before:deploy:deploy']()).to.be.fulfilled.then(
        () => expect(spawnPackageStub).to.be.not.called
      );
    });

    it('should use the default packaging mechanism if no packaging config is provided', () => {
      deploy.options.package = false;
      deploy.serverless.service.package.path = false;

      return expect(deploy.hooks['before:deploy:deploy']()).to.be.fulfilled.then(() =>
        BbPromise.all([
          expect(spawnDeployFunctionStub).to.not.be.called,
          expect(spawnPackageStub).to.be.calledOnce,
          expect(spawnPackageStub).to.be.calledWithExactly('package'),
        ])
      );
    });

    it('should execute deploy function if a function option is given', () => {
      deploy.options.package = false;
      deploy.options.function = 'myfunc';
      deploy.serverless.service.package.path = false;

      return expect(deploy.hooks['before:deploy:deploy']()).to.be.fulfilled.then(() =>
        BbPromise.all([
          expect(spawnPackageStub).to.not.be.called,
          expect(spawnDeployFunctionStub).to.be.calledOnce,
          expect(spawnDeployFunctionStub).to.be.calledWithExactly('deploy:function', {
            terminateLifecycleAfterExecution: true,
          }),
        ])
      );
    });

    it('should throw an error if provider does not exist', () => {
      deploy.serverless.service.provider.name = 'nonExistentProvider';

      return expect(deploy.hooks['before:deploy:deploy']()).to.be.rejectedWith(
        'The specified provider "nonExistentProvider" does not exist.'
      );
    });
  });
});
