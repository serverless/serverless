'use strict';

const { expect } = require('chai');
const fixtures = require('../../fixtures/programmatic');

const { deployService, removeService } = require('../../utils/integration');
const { confirmCloudWatchLogs } = require('../../utils/misc');

describe('AWS - Schedule Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceDir;
  let stackName;

  before(async () => {
    const serviceData = await fixtures.setup('schedule');
    ({ servicePath: serviceDir } = serviceData);
    stackName = `${serviceData.serviceConfig.service}-dev`;
    return deployService(serviceDir);
  });

  after(async () => {
    return removeService(serviceDir);
  });

  describe('Minimal Setup', () => {
    it('should invoke every minute', () => {
      const functionName = 'scheduleMinimal';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, async () => {}, {
        checkIsComplete: (soFarEvents) => {
          const logs = soFarEvents.reduce((data, event) => data + event.message, '');
          return logs.includes(functionName);
        },
      }).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
      });
    });
  });

  describe('Extended Setup', () => {
    it('should invoke every minute with transformed input', () => {
      const functionName = 'scheduleExtended';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, async () => {}, {
        checkIsComplete: (soFarEvents) => {
          const logs = soFarEvents.reduce((data, event) => data + event.message, '');
          return logs.includes('transformedInput');
        },
      }).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include('transformedInput');
      });
    });
  });

  describe('Extended Setup (array)', () => {
    it('should invoke every minute with transformed input', () => {
      const functionName = 'scheduleExtendedArray';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, async () => {}, {
        checkIsComplete: (soFarEvents) => {
          const logs = soFarEvents.reduce((data, event) => data + event.message, '');
          return logs.includes('transformedInput');
        },
      }).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include('transformedInput');
      });
    });
  });
});
