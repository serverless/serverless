'use strict';

const expect = require('chai').expect;
const Deploy = require('./deploy');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

describe('Deploy', () => {
  let deploy;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {};
    deploy = new Deploy(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty);
    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty);
    it('should work without options', () => {
      const noOptionDeploy = new Deploy(serverless);
      expect(noOptionDeploy).to.have.property('options').to.be.eql({});
    });
  });

  describe('"before:deploy:deploy" hook', () => {
    let spawnStub;
    let spawnPackageStub;

    beforeEach(() => {
      spawnStub = sinon
        .stub(serverless.pluginManager, 'spawn');
      spawnPackageStub = spawnStub.withArgs('package').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
    });

    it('should resolve if the package option is set', () => {
      deploy.options.package = false;
      deploy.serverless.service.package.path = 'some_path';

      return deploy.hooks['before:deploy:deploy']().then(() => {
        expect(spawnPackageStub.called).to.equal(false);
      });
    });

    it('should resolve if the service package path is set', () => {
      deploy.options.package = 'some_path';
      deploy.serverless.service.package.path = false;

      return deploy.hooks['before:deploy:deploy']().then(() => {
        expect(spawnPackageStub.called).to.equal(false);
      });
    });

    it('should use the default packaging mechanism if no packaging config is provided', () => {
      deploy.options.package = false;
      deploy.serverless.service.package.path = false;

      return deploy.hooks['before:deploy:deploy']().then(() => {
        expect(spawnPackageStub.calledOnce).to.equal(true);
      });
    });
  });
});
