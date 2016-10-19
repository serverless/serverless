'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - SNS: Single topic with single function', function () {
  this.timeout(0);

  before(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when new message is published', () => Utils
    .publishSnsMessage(process.env.TOPIC_1, 'hello world')
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('hello');
      expect(/aws:sns/g.test(logs)).to.equal(true);
      expect(/hello world/g.test(logs)).to.equal(true);
    })
  );

  after(() => {
    Utils.removeService();
  });
});
