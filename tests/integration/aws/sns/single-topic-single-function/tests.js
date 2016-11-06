'use strict';

const test = require('ava');
const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

test.before('AWS - SNS: Single topic with single function', () => {
  Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  Utils.deployService();
});

test('should trigger function when new message is published', () => Utils
  .publishSnsMessage(process.env.TOPIC_1, 'hello world')
  .delay(60000)
  .then(() => {
    const logs = Utils.getFunctionLogs('hello');
    expect(/aws:sns/g.test(logs)).to.equal(true);
    expect(/hello world/g.test(logs)).to.equal(true);
  })
);

test.after(() => {
  Utils.removeService();
});
