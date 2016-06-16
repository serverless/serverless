'use strict';

const azureCli = require('../azureCli');
const assert = require('assert');

const TEST_RESOURCE_GROUP_NAME = 'test-rg-serverless';
const TEST_RESOURCE_GROUP_LOCATION = 'West US';
const TEST_RESOURCE_GROUP_DEPLOYMENT = TEST_RESOURCE_GROUP_NAME + 'Deployment';
const TEST_TEMPLATE_PATH = "fixtures/test-deploy.json";
const TEST_PARAMETERS_PATH = "fixtures/test-parameters.json";

describe('azureCli', () => {

  afterEach( (done) => {
    setTimeout(done, 10000);
  });

  it('can create a resource group', (done) => {
    return azureCli.createResourceGroup(TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_LOCATION).then( (result) => {
      assert.equal(result.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(result.properties.provisioningState, "Succeeded");

      assert.equal(result.location, "westus");
      done();
    });
  });

  it('can deploy a resource group', (done) => {
    return azureCli.deployResourceGroup(TEST_TEMPLATE_PATH, TEST_PARAMETERS_PATH, TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_DEPLOYMENT).then( (result) => {
      assert.equal(result.name, TEST_RESOURCE_GROUP_DEPLOYMENT);
      assert.equal(result.properties.provisioningState, "Succeeded");

      done();
    });
  });

  it('can show a resource group', (done) => {
    return azureCli.showResourceGroup(TEST_RESOURCE_GROUP_NAME).then( (result) => {
      assert.equal(result.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(result.resources.length, 1);

      done();
    });
  });

  it('can delete resource group', (done) => {
    return azureCli.deleteResourceGroup(TEST_RESOURCE_GROUP_NAME).then( () => {
      azureCli.showResourceGroup(TEST_RESOURCE_GROUP_NAME).catch(() => {
        done();
      });
    });
  });

});
