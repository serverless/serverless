'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - S3: Multiple events in multiple functions with multiple buckets', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger functions when object created or deleted in buckets', () => Utils
    .createAndRemoveInBucket(process.env.BUCKET_1)
    .then(() => Utils.createAndRemoveInBucket(process.env.BUCKET_2))
    .delay(60000)
    .then(() => {
      const helloLogs = Utils.getFunctionLogs('hello');
      const worldLogs = Utils.getFunctionLogs('world');

      expect(/aws:s3/g.test(helloLogs)).to.equal(true);
      expect(/ObjectCreated:Put/g.test(helloLogs)).to.equal(true);
      expect(/ObjectRemoved:Delete/g.test(helloLogs)).to.equal(true);

      expect(/aws:s3/g.test(worldLogs)).to.equal(true);
      expect(/ObjectCreated:Put/g.test(worldLogs)).to.equal(true);
      expect(/ObjectRemoved:Delete/g.test(worldLogs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
