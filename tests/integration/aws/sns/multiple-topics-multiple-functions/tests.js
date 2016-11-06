'use strict';

const test = require('ava');
const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

test.before('AWS - SNS: Multiple topics with multiple functions', () => {
  Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  Utils.deployService();
});

test('should trigger function when new message is published', () => Utils
  .publishSnsMessage(process.env.TOPIC_1, 'topic1')
  .then(() => Utils.publishSnsMessage(process.env.TOPIC_2, 'topic2'))
  .delay(60000)
  .then(() => {
    const helloLogs = Utils.getFunctionLogs('hello');
    const worldLogs = Utils.getFunctionLogs('world');

    expect(/aws:sns/g.test(helloLogs)).to.equal(true);
    expect(/topic1/g.test(helloLogs)).to.equal(true);
    expect(/aws:sns/g.test(worldLogs)).to.equal(true);
    expect(/topic2/g.test(worldLogs)).to.equal(true);
  })
);

test.after(() => {
  Utils.removeService();
});
