'use strict';

const uuid = require('uuid');
const { expect } = require('chai');
const fixtures = require('../../fixtures/programmatic');
const awsRequest = require('@serverless/test/aws-request');
const S3Service = require('aws-sdk').S3;
const { deployService, removeService } = require('../../utils/integration');
const { createBucket, deleteBucket } = require('../../utils/s3');

describe('Base AWS provider test', function () {
  this.timeout(1000 * 60 * 10);

  const bucketName = `serverless-test-${uuid.v4()}`;
  let serviceDir;

  before(async () => {
    await createBucket(bucketName);
    ({ servicePath: serviceDir } = await fixtures.setup('function', {
      configExt: { provider: { deploymentBucket: { name: bucketName } } },
    }));
    await deployService(serviceDir);
  });

  it('should deploy in the configured aws bucket', async () => {
    // we cannot deploy an empty fixture like aws so we go for a small one
    const res = await awsRequest(S3Service, 'listObjects', { Bucket: bucketName });
    expect(
      res.Contents.filter((obj) => /compiled-cloudformation-template.json$/.test(obj.Key)).length
    ).to.equal(1);
  });

  after(async () => {
    await removeService(serviceDir);
    await deleteBucket(bucketName);
  });
});
