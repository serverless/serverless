'use strict';

const AwsProvider = require('../provider/awsProvider');
const AwsRollback = require('./index');
const Serverless = require('../../../Serverless');
const expect = require('chai').expect;
const assert = require('chai').assert;
const BbPromise = require('bluebird');
const sinon = require('sinon');

describe('AwsRollback', () => {
  let awsRollback;
  let s3Key;

  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      timestamp: 1476779096930,
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'rollback';
    awsRollback = new AwsRollback(serverless, options);
    awsRollback.serverless.cli = new serverless.classes.CLI();
    s3Key = `serverless/${serverless.service.service}/${options.stage}`;
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsRollback.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsRollback.provider).to.be.instanceof(AwsProvider));
  });

  describe('hooks', () => {
    it('should run "before:rollback:initialize" hook promise chain in order', () => {
      const validateStub = sinon.stub(awsRollback, 'validate').returns(BbPromise.resolve());

      return awsRollback.hooks['before:rollback:initialize']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
      });
    });

    it('should run "rollback:rollback" promise chain in order', () => {
      const setBucketNameStub = sinon
        .stub(awsRollback, 'setBucketName').returns(BbPromise.resolve());
      const setStackToUpdateStub = sinon
        .stub(awsRollback, 'setStackToUpdate').returns(BbPromise.resolve());
      const updateStackStub = sinon
        .stub(awsRollback, 'updateStack').returns(BbPromise.resolve());

      return awsRollback.hooks['rollback:rollback']().then(() => {
        expect(setBucketNameStub.calledOnce)
          .to.be.equal(true);
        expect(setStackToUpdateStub.calledAfter(setBucketNameStub))
          .to.be.equal(true);
        expect(updateStackStub.calledAfter(setStackToUpdateStub))
          .to.be.equal(true);
      });
    });
  });

  describe('#setStackToUpdate()', () => {
    it('should reject in case no deployments are available', () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon.stub(awsRollback.provider, 'request')
        .returns(BbPromise.resolve(s3Response));

      return awsRollback.setStackToUpdate()
        .then(() => {
          assert.isNotOk(true, 'setStackToUpdate should not resolve');
        })
        .catch((errorMessage) => {
          expect(errorMessage).to.include('Couldn\'t find any existing deployments');
          expect(listObjectsStub.calledOnce).to.be.equal(true);
          expect(listObjectsStub.calledWithExactly(
            'S3',
            'listObjectsV2',
            {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            },
            awsRollback.options.stage,
            awsRollback.options.region
          )).to.be.equal(true);
          awsRollback.provider.request.restore();
        });
    });

    it('should reject in case this specific deployments is not available', () => {
      const s3Objects = [
        {
          // eslint-disable-next-line max-len
          Key: 'serverless/rollback/dev/2000000000000-2016-10-18T08:24:56.930Z/compiled-cloudformation-template.json',
        },
        {
          Key: 'serverless/rollback/dev/2000000000000-2016-10-18T08:24:56.930Z/test.zip',
        },
      ];
      const s3Response = {
        Contents: s3Objects,
      };

      const listObjectsStub = sinon.stub(awsRollback.provider, 'request')
        .returns(BbPromise.resolve(s3Response));

      return awsRollback.setStackToUpdate()
        .then(() => {
          assert.isNotOk(true, 'setStackToUpdate should not resolve');
        })
        .catch((errorMessage) => {
          expect(errorMessage).to.include('Couldn\'t find a deployment for the timestamp');
          expect(listObjectsStub.calledOnce).to.be.equal(true);
          expect(listObjectsStub.calledWithExactly(
            'S3',
            'listObjectsV2',
            {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            },
            awsRollback.options.stage,
            awsRollback.options.region
          )).to.be.equal(true);
          awsRollback.provider.request.restore();
        });
    });

    it('should resolve set the artifactDirectoryName and resolve', () => {
      const s3Objects = [
        {
          // eslint-disable-next-line max-len
          Key: 'serverless/rollback/dev/1476779096930-2016-10-18T08:24:56.930Z/compiled-cloudformation-template.json',
        },
        {
          Key: 'serverless/rollback/dev/1476779096930-2016-10-18T08:24:56.930Z/test.zip',
        },
      ];
      const s3Response = {
        Contents: s3Objects,
      };

      const listObjectsStub = sinon.stub(awsRollback.provider, 'request')
        .returns(BbPromise.resolve(s3Response));

      return awsRollback.setStackToUpdate()
        .then(() => {
          expect(awsRollback.serverless.service.package.artifactDirectoryName)
            .to.be.equal('serverless/rollback/dev/1476779096930-2016-10-18T08:24:56.930Z');
          expect(listObjectsStub.calledOnce).to.be.equal(true);
          expect(listObjectsStub.calledWithExactly(
            'S3',
            'listObjectsV2',
            {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            },
            awsRollback.options.stage,
            awsRollback.options.region
          )).to.be.equal(true);
          awsRollback.provider.request.restore();
        });
    });
  });
});
