'use strict';

// Below tests call out to the real Azure Cli - and will
// create real resources.
// ----------------------------------------------------------------------------------------------

// const azureCli = require('../azureCli');
// const assert = require('assert');

// const RESOURCE_GROUP_NAME = 'test-rg-serverless';
// const RESOURCE_GROUP_LOCATION = 'West US';
// const RESOURCE_GROUP_DEPLOYMENT = `${RESOURCE_GROUP_NAME}-deployment`;
// const TEMPLATE_PATH = 'fixtures/test-deploy.json';
// const PARAMETERS_PATH = 'fixtures/test-parameters.json';
// const SUCCEEDED = 'Succeeded';

// describe('azureCli', () => {
//   afterEach( (done) => {
//     setTimeout(done, 10000);
//   });


//   it('can create a resource group', (done) => {
//     return azureCli.createResourceGroup(RESOURCE_GROUP_NAME, RESOURCE_GROUP_LOCATION)
//       .then(result => {
//         assert.equal(result.name, RESOURCE_GROUP_NAME);
//         assert.equal(result.properties.provisioningState, SUCCEEDED);

//         assert.equal(result.location, 'westus');
//         done();
//       });
//   });

//   it('can deploy a resource group', (done) => {
//     const groupName = RESOURCE_GROUP_NAME;
//     const groupDeployment = RESOURCE_GROUP_DEPLOYMENT;
//     const params = PARAMETERS_PATH;
//     const template = TEMPLATE_PATH;
//
//     return azureCli.deployResourceGroup(template, params, groupName, groupDeployment)
//       .then(result => {
//         assert.equal(result.name, RESOURCE_GROUP_NAME);
//         assert.equal(result.properties.provisioningState, SUCCEEDED);

//         done();
//       });
//   });

//   it('can show a resource group', (done) => {
//     return azureCli.showResourceGroup(RESOURCE_GROUP_NAME)
//       .then(result => {
//         assert.equal(result.name, RESOURCE_GROUP_NAME);
//         assert.equal(result.resources.length, 1);

//         done();
//       });
//   });

//   it('can delete resource group', (done) => {
//     return azureCli.deleteResourceGroup(TEST_RESOURCE_GROUP_NAME)
//       .then(() => {
//         azureCli.showResourceGroup(TEST_RESOURCE_GROUP_NAME).catch(() => {
//           done();
//         });
//       });
//   });
// });
