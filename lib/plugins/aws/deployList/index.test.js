'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsDeployList = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('AwsDeployList', () => {
  let serverless;
  let awsDeploy;
  let s3Key;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'listDeployments';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    s3Key = `serverless/${serverless.service.service}/${options.stage}`;
    awsDeploy = new AwsDeployList(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = {
      log: sinon.spy(),
    };
  });

  describe('#listDeployments()', () => {
    it('should print no deployments in case there are none', () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve(s3Response));

      return awsDeploy.listDeployments().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeploy.bucketName,
            Prefix: `${s3Key}`,
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
        const infoText = 'Couldn\'t find any existing deployments.';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const verifyText = 'Please verify that stage and region are correct.';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(verifyText)).to.be.equal(true);
        awsDeploy.provider.request.restore();
      });
    });

    it('should all available deployments', () => {
      const s3Response = {
        Contents: [
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/cloudformation.json` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve(s3Response));

      return awsDeploy.listDeployments().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeploy.bucketName,
            Prefix: `${s3Key}`,
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
        const infoText = 'Listing deployments:';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const timestampOne = 'Timestamp: 113304333331';
        const datetimeOne = 'Datetime: 2016-08-18T13:40:06';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(timestampOne)).to.be.equal(true);
        expect(awsDeploy.serverless.cli.log.calledWithExactly(datetimeOne)).to.be.equal(true);
        const timestampTow = 'Timestamp: 903940390431';
        const datetimeTwo = 'Datetime: 2016-08-18T23:42:08';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(timestampTow)).to.be.equal(true);
        expect(awsDeploy.serverless.cli.log.calledWithExactly(datetimeTwo)).to.be.equal(true);
        awsDeploy.provider.request.restore();
      });
    });
  });
});
