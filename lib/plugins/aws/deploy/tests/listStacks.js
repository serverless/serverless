'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe.only('cleanupS3Bucket', () => {
  let serverless;
  let awsDeploy;
  let s3Key;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'cleanupS3Bucket';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    s3Key = `serverless/${serverless.service.service}/${options.stage}`;
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = {
      log: sinon.spy(),
    };
  });

  describe('#listStacks()', () => {
    it('should print no stacks in case there are none', () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve(s3Response));

      return awsDeploy.listStacks().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        const infoText = 'Couldn\'t find any existing stacks.';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const verifyText = 'Please verify that stage and region are correct.';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(verifyText)).to.be.equal(true);
        awsDeploy.sdk.request.restore();
      });
    });

    it('should all available stacks', () => {
      const s3Response = {
        Contents: [
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/cloudformation.json` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve(s3Response));

      return awsDeploy.listStacks().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        const infoText = 'Listing deployed stacks:';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const timestampOne = 'Timestamp: 113304333331';
        const datetimeOne = 'Datetime: 2016-08-18T13:40:06';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(timestampOne)).to.be.equal(true);
        expect(awsDeploy.serverless.cli.log.calledWithExactly(datetimeOne)).to.be.equal(true);
        const timestampTow = 'Timestamp: 903940390431';
        const datetimeTwo = 'Datetime: 2016-08-18T23:42:08';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(timestampTow)).to.be.equal(true);
        expect(awsDeploy.serverless.cli.log.calledWithExactly(datetimeTwo)).to.be.equal(true);
        awsDeploy.sdk.request.restore();
      });
    });
  });
});
