'use strict';

const { expect } = require('chai');
const fixtures = require('../fixtures');

const { deployService, removeService } = require('../utils/integration');
const { confirmCloudWatchLogs } = require('../utils/misc');

describe('AWS - Schedule Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let servicePath;
  let stackName;

  before(async () => {
    const serviceData = await fixtures.setup('schedule');
    ({ servicePath } = serviceData);
    stackName = `${serviceData.serviceConfig.service}-dev`;
    return deployService(servicePath);
  });

  after(async () => {
    return removeService(servicePath);
  });

  describe('Minimal Setup', () => {
    it('should invoke every minute', () => {
      const functionName = 'scheduleMinimal';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, async () => {}, {
        timeout: 3 * 60 * 1000,
      }).then(events => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
      });
    });
  });

  describe('Extended Setup', () => {
    it('should invoke every minute with transformed input', () => {
      const functionName = 'scheduleExtended';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, async () => {}, {
        timeout: 3 * 60 * 1000,
      }).then(events => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include('transformedInput');
      });
    });
  });
});
