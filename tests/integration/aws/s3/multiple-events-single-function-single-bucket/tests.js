'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');

describe('AWS - S3: Multiple events in a single function with a single bucket', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger function when object created or deleted in bucket', () => Utils
    .createAndRemoveInBucket(process.env.BUCKET_1)
    .delay(60000)
    .then(() => {
      const logs = Utils.getFunctionLogs('hello');

      expect(/aws:s3/g.test(logs)).to.equal(true);
      expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
      expect(/ObjectRemoved:Delete/g.test(logs)).to.equal(true);
    })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
