'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - CloudWatch Event: Single event with single function', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when cloudwatchEvent runs', () => Utils
    .putCloudWatchEvents(['serverless.testapp1'])
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('cwe1');
      expect(/serverless\.testapp1/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
