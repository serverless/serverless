'use strict';

const azureCli = require('../azureCli');
const expect = require('chai').expect;
const sinon = require('sinon');

const TEST_RESOURCE_GROUP_NAME = 'testrg123';
const TEST_RESOURCE_GROUP_LOCATION = 'West US';
const TEST_RESOURCE_GROUP_DEPLOYMENT = TEST_RESOURCE_GROUP_NAME + 'Deployment';
const TEST_TEMPLATE_PATH = "fixtures/test-deploy.json";
const TEST_PARAMETERS_PATH = "fixtures/test-parameters.json";

describe('azureCli', () => {
  it('can create a resource group', (done) => {
    return azureCli.createResourceGroup(TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_LOCATION).then( (result) => {
      let resultObject = JSON.parse(result);

      assert.equal(resultObject.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(resultObject.properties.provisioningState, "Successful");

      assert.equal(resultObject.location, "westus");
      done();
    });
  });

  it('can deploy a resource group', () => {
    return azureCli.deployResourceGroup(TEST_TEMPLATE_PATH, TEST_PARAMETERS_PATH, TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_DEPLOYMENT).then( (result) => {
      let resultObject = JSON.parse(result);

      assert.equal(resultObject.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(resultObject.properties.provisioningState, "Successful");

      assert.equal(resultObject.location, "westus");
    });
  });

  it('can show a resource group', () => {
    return azureCli.showResourceGroup(TEST_TEMPLATE_PATH).then( (result) => {
      let resultObject = JSON.parse(result);

      assert.equal(resultObject.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(resultObject.resources.length, 1);
    });
  });

  it('can delete resource group', () => {
    return azureCli.deleteResourceGroup(TEST_TEMPLATE_PATH);
  });
});
