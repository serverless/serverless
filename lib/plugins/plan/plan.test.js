'use strict';

const chai = require('chai');
const Plan = require('./plan');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('Plan', () => {
  let deploy;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {};
    deploy = new Plan(serverless, options);
  });

  describe('#constructor()', () => {
    // it('should have commands', () => expect(deploy.commands).to.be.not.empty);
    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty);
    it('should work without options', () => {
      const noOptionDeploy = new Plan(serverless);
      expect(noOptionDeploy).to.have.property('options').to.be.eql({});
    });
  });

  describe('"before:plan:plan" hook', () => {
    let validateStub;
    let spawnStub;
    let spawnPackageStub;

    beforeEach(() => {
      validateStub = sinon.stub(deploy, 'validate').resolves();
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn');
      spawnPackageStub = spawnStub.withArgs('package').resolves();
    });

    afterEach(() => {
      deploy.validate.restore();
      serverless.pluginManager.spawn.restore();
    });

    it('should run the validation', () => expect(deploy.hooks['before:plan:plan']())
      .to.be.fulfilled.then(() => expect(validateStub).to.be.called)
    );

    it('should resolve if the package option is set', () => {
      deploy.options.package = false;
      deploy.serverless.service.package.path = 'some_path';

      return expect(deploy.hooks['before:plan:plan']()).to.be.fulfilled
        .then(() => expect(spawnPackageStub).to.be.not.called);
    });

    it('should resolve if the service package path is set', () => {
      deploy.options.package = 'some_path';
      deploy.serverless.service.package.path = false;

      return expect(deploy.hooks['before:plan:plan']()).to.be.fulfilled
        .then(() => expect(spawnPackageStub).to.be.not.called);
    });
  });
});
