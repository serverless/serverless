'use strict';

const { expect } = require('chai');
const fixtures = require('../fixtures');

const {
  deployService,
  removeService,
  waitForFunctionLogs,
  getMarkers,
} = require('../utils/integration');

describe('AWS - Schedule Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let servicePath;

  before(async () => {
    const serviceData = await fixtures.setup('schedule');
    ({ servicePath } = serviceData);
    return deployService(servicePath);
  });

  after(async () => {
    return removeService(servicePath);
  });

  describe('Minimal Setup', () => {
    it('should invoke every minute', () => {
      const functionName = 'scheduleMinimal';
      const markers = getMarkers(functionName);

      return waitForFunctionLogs(servicePath, functionName, markers.start, markers.end).then(
        logs => {
          expect(logs).to.include(functionName);
        }
      );
    });
  });

  describe('Extended Setup', () => {
    it('should invoke every minute with transformed input', () => {
      const functionName = 'scheduleExtended';
      const markers = getMarkers(functionName);

      return waitForFunctionLogs(servicePath, functionName, markers.start, markers.end).then(
        logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include('transformedInput');
        }
      );
    });
  });
});
