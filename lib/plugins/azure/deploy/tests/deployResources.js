'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const BbPromise = require('bluebird');

const AzureDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const azureCli = require('../../utils/azureCli');

describe('#deployResources()', () => {
  const serverless = new Serverless();
  const azureDeploy = new AzureDeploy(serverless);
  const expectedTempDir = path.join(os.tmpDir(), 'serverless');

  it('should empty the temp serverless directory before operating', (done) => {
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = { testtemplate: true };
    azureDeploy.options = { stage: 'dev' };

    sinon.stub(fs, 'emptyDir', (directory, cb) => {
      expect(directory).to.be.equal(expectedTempDir);
      cb();
    });
    sinon.stub(fs, 'outputJson', (file, resources, cb) => cb());
    sinon.stub(azureCli, 'deployResourceGroup', () => BbPromise.resolve());

    // Let's test it
    azureDeploy.deployResources()
      .then(() => {
        sinon.assert.calledOnce(fs.emptyDir);

        fs.emptyDir.restore();
        fs.outputJson.restore();
        azureCli.deployResourceGroup.restore();

        done();
      });
  });

  it('should write the arm template to a temp file', (done) => {
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = { testtemplate: true };
    azureDeploy.options = { stage: 'dev' };

    sinon.stub(fs, 'emptyDir', (directory, cb) => cb());
    sinon.stub(fs, 'outputJson', (file, resources, cb) => {
      const fileMatches = file.includes(expectedTempDir);

      expect(resources).to.be.equal(azureDeploy.serverless.service.resources.azure);
      expect(fileMatches).to.be.equal(true);

      cb();
    });
    sinon.stub(azureCli, 'deployResourceGroup', () => BbPromise.resolve());
    // Let's test it
    azureDeploy.deployResources()
      .then(() => {
        sinon.assert.calledOnce(fs.outputJson);

        fs.emptyDir.restore();
        fs.outputJson.restore();
        azureCli.deployResourceGroup.restore();

        done();
      });
  });

  it('should call out to the azure cli to create the deployment', (done) => {
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = { testtemplate: true };
    azureDeploy.options = { stage: 'dev' };

    sinon.stub(fs, 'emptyDir', (directory, cb) => cb());
    sinon.stub(fs, 'outputJson', (file, resources, cb) => cb());
    sinon.stub(azureCli, 'deployResourceGroup', (file, params, name, deployment) => {
      expect(file).to.be.equal(azureDeploy.armFile);
      expect(params).to.be.equal(null);
      expect(name).to.be.equal('first-service-dev');
      expect(deployment.includes('serverless-')).to.be.equal(true);
      return BbPromise.resolve();
    });

    // Let's test it
    azureDeploy.deployResources()
      .then(() => {
        sinon.assert.calledOnce(fs.outputJson);

        fs.emptyDir.restore();
        fs.outputJson.restore();
        azureCli.deployResourceGroup.restore();

        done();
      });
  });
});
