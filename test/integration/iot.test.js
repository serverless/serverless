'use strict';

const { expect } = require('chai');
const fixtures = require('../fixtures');

const { publishIotData } = require('../utils/iot');
const {
  deployService,
  removeService,
  waitForFunctionLogs,
  getMarkers,
} = require('../utils/integration');

describe('AWS - IoT Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let iotTopic;
  let servicePath;

  before(async () => {
    const serviceData = await fixtures.setup('iot');
    ({ servicePath } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    iotTopic = `${serviceName}/test`;
    return deployService(servicePath);
  });

  after(() => {
    // Topics are ephemeral and IoT endpoint is part of the account
    return removeService(servicePath);
  });

  describe('Basic Setup', () => {
    it('should invoke on a topic message matching the rule', () => {
      const functionName = 'iotBasic';
      const markers = getMarkers(functionName);
      const message = JSON.stringify({ message: 'Hello from IoT!' });

      // NOTE: This test may fail on fresh accounts where the IoT endpoint has not completed provisioning
      return publishIotData(iotTopic, message)
        .then(() => waitForFunctionLogs(servicePath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(message);
        });
    });
  });
});
