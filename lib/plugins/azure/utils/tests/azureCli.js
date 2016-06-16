'use strict';

const azureCli = require('../azureCli');
const expect = require('chai').expect;
const sinon = require('sinon');

const TEST_RESOURCE_GROUP_NAME = 'testrg123';
const TEST_RESOURCE_GROUP_LOCATION = 'West US';

describe('azureCli', () => {
  it('can create a resource group', () => {
    return azureCli.createResourceGroup(TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_LOCATION).then( (result) => {
      let resultObject = JSON.parse(result);

      assert.equal(resultObject.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(resultObject.properties.provisioningState, "Successful");

      assert.equal(resultObject.location, "westus");
    });
  });

  it('can deploy a resource group', () => {
    return azureCli.deployResourceGroup(TEST_RESOURCE_GROUP_NAME, TEST_RESOURCE_GROUP_LOCATION).then( (result) => {
      let resultObject = JSON.parse(result);

      assert.equal(resultObject.name, TEST_RESOURCE_GROUP_NAME);
      assert.equal(resultObject.properties.provisioningState, "Successful");

      assert.equal(resultObject.location, "westus");
    });
  });
});
