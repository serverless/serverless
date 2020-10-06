'use strict';

const fixtures = require('../fixtures');
const { deployService, removeService } = require('../utils/integration');

describe('AWS - IoT Fleet Provisioning Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let servicePath;

  before(async () => {
    ({ servicePath } = await fixtures.setup('iotFleetProvisioning'));
    await deployService(servicePath);
  });

  after(async () => {
    await removeService(servicePath);
  });

  it('setup a new IoT Thing with the provisioning template', async () => {});
});
