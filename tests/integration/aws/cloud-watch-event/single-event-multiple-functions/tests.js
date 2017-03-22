'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - CloudWatch Event: Single event with multiple functions', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger functions when cloudwatchEvent runs', () => Utils
    .putCloudWatchEvents(['serverless.testapp1'])
    .delay(60000)
    .then(() => {
      const logs1 = Utils.getFunctionLogs('cwe1');
      const logs2 = Utils.getFunctionLogs('cwe2');
      expect(/serverless\.testapp1/g.test(logs1)).to.equal(true);
      expect(/serverless\.testapp1/g.test(logs2)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
