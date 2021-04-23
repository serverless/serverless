'use strict';

const uuid = require('uuid');
const { expect } = require('chai');
const fixtures = require('../fixtures/programmatic');
const awsRequest = require('@serverless/test/aws-request');
const { deployService, removeService } = require('../utils/integration');
const { createBucket, deleteBucket } = require('../utils/s3');

describe('Base AWS provider test', function () {
  this.timeout(1000 * 60 * 10);

  const bucketName = `serverless-test-${uuid.v4()}`;

  before(async () => {
    await createBucket(bucketName);
  });

  it('should deploy in the configured aws bucket', async () => {
    // we cannot deploy an empty fixture like aws so we go for a small one
    const { servicePath } = await fixtures.setup('function', {
      configExt: { provider: { deploymentBucket: { name: bucketName } } },
    });
    await deployService(servicePath);
    const res = await awsRequest('S3', 'listObjects', { Bucket: bucketName });
    expect(
      res.Contents.filter((obj) => /compiled-cloudformation-template.json$/.test(obj.Key)).length
    ).to.equal(1);
    await removeService(servicePath);
  });

  after(async () => {
    await deleteBucket(bucketName);
  });
});
