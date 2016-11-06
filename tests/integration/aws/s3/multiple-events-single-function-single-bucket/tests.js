'use strict';

const test = require('ava');
const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

test.before(() => {
  Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  Utils.deployService();
});

test('should trigger function when object created or deleted in bucket', () => Utils
  .createAndRemoveInBucket(process.env.BUCKET_1)
  .delay(60000)
  .then(() => {
    const logs = Utils.getFunctionLogs('hello');

    expect(/aws:s3/g.test(logs)).to.equal(true);
    expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
    expect(/ObjectRemoved:Delete/g.test(logs)).to.equal(true);
  })
);

test.after(() => {
  Utils.removeService();
});
