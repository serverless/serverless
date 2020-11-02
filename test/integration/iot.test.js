'use strict';

const { expect } = require('chai');
const fixtures = require('../fixtures');

const { publishIotData } = require('../utils/iot');
const { confirmCloudWatchLogs } = require('../utils/misc');
const { deployService, removeService } = require('../utils/integration');

describe('AWS - IoT Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let iotTopic;
  let servicePath;
  let stackName;

  before(async () => {
    const serviceData = await fixtures.setup('iot');
    ({ servicePath } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    iotTopic = `${serviceName}/test`;
    stackName = `${serviceName}-dev`;

    return deployService(servicePath);
  });

  after(() => {
    // Topics are ephemeral and IoT endpoint is part of the account
    return removeService(servicePath);
  });

  describe('Basic Setup', () => {
    it('should invoke on a topic message matching the rule', async () => {
      const functionName = 'iotBasic';
      const message = JSON.stringify({ message: 'Hello from IoT!' });

      // NOTE: This test may fail on fresh accounts where the IoT endpoint has not completed provisioning
      const events = await confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        async () => publishIotData(iotTopic, message)
      );
      const logs = events.reduce((data, event) => data + event.message, '');
      expect(logs).to.include(message);
    });
  });
});
