'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - IoT: Single rule with single function', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when ruletopic message is published', () => Utils
    .publishIotData('mybutton', '{"message":"hello serverless"}')
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('iot1');
      expect(/{"message":"hello serverless"}/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
