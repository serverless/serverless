'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const { createBucket, createAndRemoveInBucket, deleteBucket } = require('../../utils/s3');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - S3 Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let bucketMinimalSetup;
  let bucketExtendedSetup;
  let bucketExistingSimpleSetup;
  let bucketExistingComplexSetup;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique S3 bucket names for each test (to avoid collision among concurrent CI runs)
        config => {
          bucketMinimalSetup = `${config.service}-s3-minimal`;
          bucketExtendedSetup = `${config.service}-s3-extended`;
          bucketExistingSimpleSetup = `${config.service}-s3-existing-simple`;
          bucketExistingComplexSetup = `${config.service}-s3-existing-complex`;
          config.functions.minimal.events[0].s3 = bucketMinimalSetup;
          config.functions.extended.events[0].s3.bucket = bucketExtendedSetup;
          config.functions.existing.events[0].s3.bucket = bucketExistingSimpleSetup;
          config.functions.existingCreated.events[0].s3.bucket = bucketExistingComplexSetup;
          config.functions.existingCreated.events[1].s3.bucket = bucketExistingComplexSetup;
          config.functions.existingRemoved.events[0].s3.bucket = bucketExistingComplexSetup;
          config.functions.existingRemoved.events[1].s3.bucket = bucketExistingComplexSetup;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create external S3 buckets
    // NOTE: deployment can only be done once the S3 buckets are created
    console.info('Creating S3 buckets...');
    return BbPromise.all([
      createBucket(bucketExistingSimpleSetup),
      createBucket(bucketExistingComplexSetup),
    ]).then(() => {
      console.info(`Deploying "${stackName}" service...`);
      return deployService(tmpDirPath);
    });
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info('Deleting S3 buckets');
    return BbPromise.all([
      deleteBucket(bucketExistingSimpleSetup),
      deleteBucket(bucketExistingComplexSetup),
    ]);
  });

  describe('Minimal Setup', () => {
    it('should invoke function when an object is created', () => {
      const functionName = 'minimal';
      const markers = getMarkers(functionName);
      const expectedMessage = `Hello from S3! - (${functionName})`;

      return createAndRemoveInBucket(bucketMinimalSetup)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(/aws:s3/g.test(logs)).to.equal(true);
          expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
          expect(logs.includes(expectedMessage)).to.equal(true);
        });
    });
  });

  describe('Extended Setup', () => {
    it('should invoke function when an object is removed', () => {
      const functionName = 'extended';
      const markers = getMarkers(functionName);
      const expectedMessage = `Hello from S3! - (${functionName})`;

      return createAndRemoveInBucket(bucketExtendedSetup, { prefix: 'photos/', suffix: '.jpg' })
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(/aws:s3/g.test(logs)).to.equal(true);
          expect(/ObjectRemoved:Delete/g.test(logs)).to.equal(true);
          expect(logs.includes(expectedMessage)).to.equal(true);
        });
    });
  });

  describe('Existing Setup', () => {
    describe('Single function / single bucket setup', () => {
      it('should invoke function when an object is created', () => {
        const functionName = 'existing';
        const markers = getMarkers(functionName);
        const expectedMessage = `Hello from S3! - (${functionName})`;

        return createAndRemoveInBucket(bucketExistingSimpleSetup, {
          prefix: 'Files/',
          suffix: '.TXT',
        })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(/aws:s3/g.test(logs)).to.equal(true);
            expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
            expect(logs.includes(expectedMessage)).to.equal(true);
          });
      });
    });

    describe('Multi function / multi bucket setup', () => {
      it('should invoke function when a .jpg object is created', () => {
        const functionName = 'existingCreated';
        const markers = getMarkers(functionName);
        const expectedMessage = `Hello from S3! - (${functionName})`;

        return createAndRemoveInBucket(bucketExistingComplexSetup, {
          prefix: 'photos',
          suffix: '.jpg',
        })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(/aws:s3/g.test(logs)).to.equal(true);
            expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
            expect(logs.includes(expectedMessage)).to.equal(true);
          });
      });
      it('should invoke function when a .jpg object is removed', () => {
        const functionName = 'existingRemoved';
        const markers = getMarkers(functionName);
        const expectedMessage = `Hello from S3! - (${functionName})`;

        return createAndRemoveInBucket(bucketExistingComplexSetup, {
          prefix: 'photos',
          suffix: '.jpg',
        })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(/aws:s3/g.test(logs)).to.equal(true);
            expect(/ObjectRemoved:Delete/g.test(logs)).to.equal(true);
            expect(logs.includes(expectedMessage)).to.equal(true);
          });
      });
      it('should invoke function when a .png object is created', () => {
        const functionName = 'existingCreated';
        const markers = getMarkers(functionName);
        const expectedMessage = `Hello from S3! - (${functionName})`;

        return createAndRemoveInBucket(bucketExistingComplexSetup, {
          prefix: 'photos',
          suffix: '.png',
        })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(/aws:s3/g.test(logs)).to.equal(true);
            expect(/ObjectCreated:Put/g.test(logs)).to.equal(true);
            expect(logs.includes(expectedMessage)).to.equal(true);
          });
      });
      it('should invoke function when a .png object is removed', () => {
        const functionName = 'existingRemoved';
        const markers = getMarkers(functionName);
        const expectedMessage = `Hello from S3! - (${functionName})`;

        return createAndRemoveInBucket(bucketExistingComplexSetup, {
          prefix: 'photos',
          suffix: '.png',
        })
          .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
          .then(logs => {
            expect(/aws:s3/g.test(logs)).to.equal(true);
            expect(/ObjectRemoved:Delete/g.test(logs)).to.equal(true);
            expect(logs.includes(expectedMessage)).to.equal(true);
          });
      });
    });
  });
});
