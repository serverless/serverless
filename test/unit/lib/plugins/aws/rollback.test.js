'use strict';

const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const AwsRollback = require('../../../../../lib/plugins/aws/rollback');
const Serverless = require('../../../../../lib/Serverless');
const expect = require('chai').expect;
const assert = require('chai').assert;
const sinon = require('sinon');

describe('AwsRollback', () => {
  let awsRollback;
  let s3Key;
  let spawnStub;
  let serverless;
  let provider;

  const createInstance = (options) => {
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'rollback';

    spawnStub = sinon.stub(serverless.pluginManager, 'spawn');

    awsRollback = new AwsRollback(serverless, options);
    awsRollback.bucketName = 'deployment-bucket';
    awsRollback.serverless.cli = new serverless.classes.CLI();
    const prefix = provider.getDeploymentPrefix();
    s3Key = `${prefix}/${serverless.service.service}/${provider.getStage()}`;
  };

  beforeEach(() => {
    createInstance({
      stage: 'dev',
      region: 'us-east-1',
      timestamp: 1476779096930,
    });

    return Promise.resolve();
  });

  afterEach(() => {
    serverless.pluginManager.spawn.restore();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsRollback.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsRollback.provider).to.be.instanceof(AwsProvider));
  });

  describe('hooks', () => {
    it('should run "before:rollback:initialize" hook promise chain in order', () => {
      const validateStub = sinon.stub(awsRollback, 'validate').resolves();

      return awsRollback.hooks['before:rollback:initialize']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
      });
    });

    it('should run "rollback:rollback" promise chain in order', () => {
      const setBucketNameStub = sinon.stub(awsRollback, 'setBucketName').resolves();
      const setStackToUpdateStub = sinon.stub(awsRollback, 'setStackToUpdate').resolves();
      const updateStackStub = sinon.stub(awsRollback, 'updateStack').resolves();

      return awsRollback.hooks['rollback:rollback']().then(() => {
        expect(setBucketNameStub.calledOnce).to.be.equal(true);
        expect(setStackToUpdateStub.calledAfter(setBucketNameStub)).to.be.equal(true);
        expect(updateStackStub.calledAfter(setStackToUpdateStub)).to.be.equal(true);
      });
    });

    it('should run "deploy:list" if timestamp is not specified', () => {
      const spawnDeployListStub = spawnStub.withArgs('deploy:list').resolves();
      awsRollback.options.timestamp = undefined;

      return awsRollback.hooks['rollback:rollback']().then(() => {
        expect(spawnDeployListStub.calledOnce).to.be.equal(true);
      });
    });
  });

  describe('#setStackToUpdate()', () => {
    const createS3RequestsStub = (fixtures) => {
      const stub = sinon.stub(awsRollback.provider, 'request');

      const serviceObjects = {
        Contents: fixtures
          .flatMap(({ timestamp, artifacts }) => [
            `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
            ...Object.values(artifacts),
          ])
          .sort() // listObjectsV2() provides entries in the ascending order
          .filter((value, index, all) => all.indexOf(value) === index)
          .map((item) => ({ Key: item })),
      };
      stub.withArgs('S3', 'listObjectsV2').resolves(serviceObjects);

      fixtures.forEach(({ timestamp, artifacts }) => {
        stub
          .withArgs('S3', 'getObject', {
            Bucket: awsRollback.bucketName,
            Key: `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
          })
          .resolves({
            Body: JSON.stringify({
              Resources: Object.entries(artifacts)
                .map(([name, key]) => [name, { Properties: { Code: { S3Key: key } } }])
                .reduce((acc, [key, value]) => {
                  acc[key] = value;
                  return acc;
                }, {}),
            }),
          });
      });

      return stub;
    };

    it('should resolve when the timestamp argument is passed as a string', () => {
      createInstance({
        stage: 'dev',
        region: 'us-east-1',
        timestamp: '1476779096930',
      });

      const awsRequestsStub = createS3RequestsStub([
        {
          timestamp: '1476779096930-2016-10-18T08:24:56.930Z',
          artifacts: { Foobar: `${s3Key}/1476779096930-2016-10-18T08:24:56.930Z/test.zip` },
        },
      ]);

      return awsRollback.setStackToUpdate().then(() => {
        expect(awsRollback.serverless.service.package.deploymentDirectoryPrefix).to.be.equal(
          'serverless/rollback/dev'
        );
        expect(awsRollback.serverless.service.package.timestamp).to.be.equal(
          '1476779096930-2016-10-18T08:24:56.930Z'
        );

        awsRequestsStub.restore();
      });
    });

    it('should reject in case no deployments are available', () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon.stub(awsRollback.provider, 'request').resolves(s3Response);

      return awsRollback
        .setStackToUpdate()
        .then(() => {
          assert.isNotOk(true, 'setStackToUpdate should not resolve');
        })
        .catch((error) => {
          expect(error.code).to.equal('ROLLBACK_DEPLOYMENTS_NOT_FOUND');
          expect(listObjectsStub.called).to.be.equal(true);
          expect(
            listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            })
          ).to.be.equal(true);
          awsRollback.provider.request.restore();
        });
    });

    it('should reject if specific deployment is not available', () => {
      const awsRequestsStub = createS3RequestsStub([
        {
          timestamp: '2000000000000-2016-10-18T08:24:56.930Z',
          artifacts: { Foobar: `${s3Key}/2000000000000-2016-10-18T08:24:56.930Z/test.zip` },
        },
      ]);

      return awsRollback
        .setStackToUpdate()
        .then(() => {
          assert.isNotOk(true, 'setStackToUpdate should not resolve');
        })
        .catch((error) => {
          expect(error.code).to.equal('ROLLBACK_DEPLOYMENT_NOT_FOUND');
          expect(awsRequestsStub.called).to.be.equal(true);
          expect(
            awsRequestsStub.calledWithExactly('S3', 'listObjectsV2', {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            })
          ).to.be.equal(true);
          awsRequestsStub.restore();
        });
    });

    it('should resolve set the deploymentDirectoryPrefix and resolve', () => {
      const awsRequestsStub = createS3RequestsStub([
        {
          timestamp: '1476779096930-2016-10-18T08:24:56.930Z',
          artifacts: { Foobar: `${s3Key}/1476779096930-2016-10-18T08:24:56.930Z/test.zip` },
        },
      ]);

      return awsRollback.setStackToUpdate().then(() => {
        expect(awsRollback.serverless.service.package.deploymentDirectoryPrefix).to.be.equal(
          'serverless/rollback/dev'
        );
        expect(awsRollback.serverless.service.package.timestamp).to.be.equal(
          '1476779096930-2016-10-18T08:24:56.930Z'
        );
        expect(awsRequestsStub.called).to.be.equal(true);
        expect(
          awsRequestsStub.calledWithExactly('S3', 'listObjectsV2', {
            Bucket: awsRollback.bucketName,
            Prefix: `${s3Key}`,
          })
        ).to.be.equal(true);
        awsRequestsStub.restore();
      });
    });
  });
});
