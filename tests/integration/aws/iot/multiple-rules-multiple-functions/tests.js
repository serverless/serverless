'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - IoT: Multiple rules with multiple functions', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when ruletopic message is published', () => Utils
    .publishIotData('mybutton', '{"message":"hello serverless"}')
    .then(() => Utils.publishIotData('weather', '{"message":"sunny today"}'))
    .delay(60000)
    .then(() => {
      const iot1Logs = Utils.getFunctionLogs('iot1');
      const iot2Logs = Utils.getFunctionLogs('iot2');
      expect(/{"message":"hello serverless"}/g.test(iot1Logs)).to.equal(true);
      expect(/{"message":"sunny today"}/g.test(iot2Logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
