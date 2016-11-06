'use strict';

const test = require('ava');
const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');
const BbPromise = require('bluebird');

test.before('AWS - Schedule: Multiple schedules with multiple functions', () => {
  Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  Utils.deployService();
});

test('should trigger functions every minute', () => BbPromise.resolve()
  .delay(100000)
  .then(() => {
    const helloLogs = Utils.getFunctionLogs('hello');
    const worldLogs = Utils.getFunctionLogs('world');

    expect(/Scheduled Event/g.test(helloLogs)).to.equal(true);
    expect(/aws\.events/g.test(helloLogs)).to.equal(true);
    expect(/Scheduled Event/g.test(worldLogs)).to.equal(true);
    expect(/aws\.events/g.test(worldLogs)).to.equal(true);
  })
);

test.after(() => {
  Utils.removeService();
});
