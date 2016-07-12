'use strict';

const sinon = require('sinon');
const azureCli = require('../../utils/azureCli');
const AzureDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('#createResourceGroup()', () => {
  const serverless = new Serverless();
  const azureDeploy = new AzureDeploy(serverless);

  it('should try to delete a resource group if it already exists', (done) => {
    azureDeploy.options = {
      stage: 'dev',
      region: 'useast',
    };
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = {
      variables: {
        location: 'useast',
      },
    };

    sinon.stub(azureCli, 'showResourceGroup', () => BbPromise.resolve());
    sinon.stub(azureCli, 'deleteResourceGroup', () => BbPromise.resolve());
    sinon.stub(azureCli, 'createResourceGroup', () => BbPromise.resolve());

    // Let's test it
    azureDeploy.createResourceGroup()
      .then(() => {
        sinon.assert.calledOnce(azureCli.deleteResourceGroup);
        sinon.assert.calledOnce(azureCli.createResourceGroup);
        azureCli.showResourceGroup.restore();
        azureCli.deleteResourceGroup.restore();
        azureCli.createResourceGroup.restore();
        done();
      });
  });

  it('should not try to delete a resource group if it does not already exists', (done) => {
    azureDeploy.options = {
      stage: 'dev',
      region: 'useast',
    };
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = {
      variables: {
        location: 'useast',
      },
    };

    sinon.stub(azureCli, 'showResourceGroup', () => BbPromise.reject());
    sinon.stub(azureCli, 'deleteResourceGroup', () => BbPromise.resolve());
    sinon.stub(azureCli, 'createResourceGroup', () => BbPromise.resolve());

    // Let's test it
    azureDeploy.createResourceGroup()
      .then(() => {
        sinon.assert.calledOnce(azureCli.createResourceGroup);
        sinon.assert.callCount(azureCli.deleteResourceGroup, 0);
        azureCli.showResourceGroup.restore();
        azureCli.deleteResourceGroup.restore();
        azureCli.createResourceGroup.restore();
        done();
      });
  });
});
