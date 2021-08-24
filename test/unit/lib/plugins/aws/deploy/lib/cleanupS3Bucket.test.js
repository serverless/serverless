'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const AwsDeploy = require('../../../../../../../lib/plugins/aws/deploy/index');
const Serverless = require('../../../../../../../lib/Serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('cleanupS3Bucket', () => {
  let serverless;
  let provider;
  let awsDeploy;
  let s3Key;

  const createS3RequestsStub = (fixtures) => {
    const stub = sinon.stub(awsDeploy.provider, 'request');

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
          Bucket: awsDeploy.bucketName,
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

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.serviceDir = 'foo';
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'cleanupS3Bucket';
    const prefix = provider.getDeploymentPrefix();
    s3Key = `${prefix}/${serverless.service.service}/${provider.getStage()}`;
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#getObjectsToRemove()', () => {
    it('should resolve if no objects are found', () => {
      const serviceObjects = {
        Contents: [],
      };

      const listObjectsStub = sinon.stub(awsDeploy.provider, 'request').resolves(serviceObjects);

      return awsDeploy.getObjectsToRemove().then(() => {
        expect(listObjectsStub).to.have.been.calledOnce;
        expect(listObjectsStub).to.have.been.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeploy.bucketName,
          Prefix: `${s3Key}`,
        });
        awsDeploy.provider.request.restore();
      });
    });

    it('should return all to be removed service objects (except the last 5)', async () => {
      const deployFixtures = [
        {
          timestamp: '151224711231-2016-08-18T15:42:00',
          artifacts: { Foobar: `${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` },
        },
        {
          timestamp: '141264711231-2016-08-18T15:43:00',
          artifacts: { Foobar: `${s3Key}/141264711231-2016-08-18T15:43:00/foobar.zip` },
        },
        {
          timestamp: '141321321541-2016-08-18T11:23:02',
          artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip` },
        },
        {
          timestamp: '142003031341-2016-08-18T12:46:04',
          artifacts: { Foobar: `${s3Key}/142003031341-2016-08-18T12:46:04/artifact.zip` },
        },
        {
          timestamp: '113304333331-2016-08-18T13:40:06',
          artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00012.zip` },
        },
        {
          timestamp: '903940390431-2016-08-18T23:42:08',
          artifacts: { Foobar: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
        },
      ];
      const awsRequestsStub = createS3RequestsStub(deployFixtures);

      const objectsToRemove = await awsDeploy.getObjectsToRemove();
      expect(objectsToRemove).to.have.same.deep.members([
        {
          Key: 'serverless/cleanupS3Bucket/dev/113304333331-2016-08-18T13:40:06/compiled-cloudformation-template.json',
        },
        { Key: 'serverless/cleanupS3Bucket/dev/foobar/cafebabecafebabecafebabe00012.zip' },
      ]);
      expect(awsRequestsStub.called).to.be.equal(true);
      expect(awsRequestsStub).to.have.been.calledWithExactly('S3', 'listObjectsV2', {
        Bucket: awsDeploy.bucketName,
        Prefix: `${s3Key}`,
      });
      awsRequestsStub.restore();
    });

    it('should return an empty array if there are less than 5 directories available', () => {
      const deployFixtures = [
        {
          timestamp: '151224711231-2016-08-18T15:42:00',
          artifacts: { Foobar: `${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` },
        },
        {
          timestamp: '141264711231-2016-08-18T15:43:00',
          artifacts: { Foobar: `${s3Key}/141264711231-2016-08-18T15:43:00/foobar.zip` },
        },
        {
          timestamp: '141321321541-2016-08-18T11:23:02',
          artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip` },
        },
      ];
      const awsRequestsStub = createS3RequestsStub(deployFixtures);

      return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
        expect(objectsToRemove.length).to.equal(0);
        expect(awsRequestsStub.called).to.be.equal(true);
        expect(awsRequestsStub).to.have.been.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeploy.bucketName,
          Prefix: `${s3Key}`,
        });
        awsDeploy.provider.request.restore();
      });
    });

    it('should return an empty array if there are exactly 5 directories available', () => {
      const deployFixtures = [
        {
          timestamp: '151224711231-2016-08-18T15:42:00',
          artifacts: { Foobar: `${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` },
        },
        {
          timestamp: '141264711231-2016-08-18T15:43:00',
          artifacts: { Foobar: `${s3Key}/141264711231-2016-08-18T15:43:00/foobar.zip` },
        },
        {
          timestamp: '141321321541-2016-08-18T11:23:02',
          artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip` },
        },
        {
          timestamp: '142003031341-2016-08-18T12:46:04',
          artifacts: { Foobar: `${s3Key}/142003031341-2016-08-18T12:46:04/artifact.zip` },
        },
        {
          timestamp: '113304333331-2016-08-18T13:40:06',
          artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00012.zip` },
        },
      ];

      const awsRequestsStub = createS3RequestsStub(deployFixtures);

      return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
        expect(objectsToRemove).to.have.lengthOf(0);
        expect(awsRequestsStub).to.have.been.called;
        expect(awsRequestsStub).to.have.been.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeploy.bucketName,
          Prefix: `${s3Key}`,
        });
        awsDeploy.provider.request.restore();
      });
    });

    describe('custom maxPreviousDeploymentArtifacts', () => {
      afterEach(() => {
        // restore to not conflict with other tests
        delete serverless.service.provider.deploymentBucketObject;
      });

      it('should allow configuring the number of artifacts to preserve', () => {
        // configure the provider to allow only a single artifact
        serverless.service.provider.deploymentBucketObject = {
          maxPreviousDeploymentArtifacts: 1,
        };
        const deployFixtures = [
          {
            timestamp: '151224711231-2016-08-18T15:42:00',
            artifacts: { Foobar: `${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` },
          },
          {
            timestamp: '141264711231-2016-08-18T15:43:00',
            artifacts: { Foobar: `${s3Key}/141264711231-2016-08-18T15:43:00/foobar.zip` },
          },
          {
            timestamp: '141321321541-2016-08-18T11:23:02',
            artifacts: { Foobar: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip` },
          },
        ];

        const awsRequestsStub = createS3RequestsStub(deployFixtures);

        return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
          expect(objectsToRemove).to.have.same.deep.members([
            { Key: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip` },
            {
              Key: `${s3Key}/141321321541-2016-08-18T11:23:02/compiled-cloudformation-template.json`,
            },
            { Key: `${s3Key}/141264711231-2016-08-18T15:43:00/foobar.zip` },
            {
              Key: `${s3Key}/141264711231-2016-08-18T15:43:00/compiled-cloudformation-template.json`,
            },
          ]);

          expect(awsRequestsStub.called).to.be.equal(true);
          expect(awsRequestsStub).to.have.been.calledWithExactly('S3', 'listObjectsV2', {
            Bucket: awsDeploy.bucketName,
            Prefix: `${s3Key}`,
          });
          awsDeploy.provider.request.restore();
        });
      });
    });
  });

  describe('#removeObjects()', () => {
    let deleteObjectsStub;

    beforeEach(() => {
      deleteObjectsStub = sinon.stub(awsDeploy.provider, 'request').resolves();
    });

    it('should resolve if no service objects are found in the S3 bucket', () =>
      awsDeploy.removeObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(false);
        awsDeploy.provider.request.restore();
      }));

    it('should remove all old service files from the S3 bucket if available', () => {
      const objectsToRemove = [
        { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
        { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/compiled-cloudformation-template.json` },
        { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/artifact.zip` },
        { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/compiled-cloudformation-template.json` },
      ];

      return awsDeploy.removeObjects(objectsToRemove).then(() => {
        expect(deleteObjectsStub).to.have.been.calledOnce;
        expect(deleteObjectsStub).to.have.been.calledWithExactly('S3', 'deleteObjects', {
          Bucket: awsDeploy.bucketName,
          Delete: {
            Objects: objectsToRemove,
          },
        });
        awsDeploy.provider.request.restore();
      });
    });
  });

  describe('#cleanupS3Bucket()', () => {
    it('should run promise chain in order', () => {
      const getObjectsToRemoveStub = sinon.stub(awsDeploy, 'getObjectsToRemove').resolves();
      const removeObjectsStub = sinon.stub(awsDeploy, 'removeObjects').resolves();

      return awsDeploy.cleanupS3Bucket().then(() => {
        expect(getObjectsToRemoveStub.calledOnce).to.be.equal(true);
        expect(removeObjectsStub.calledAfter(getObjectsToRemoveStub)).to.be.equal(true);

        awsDeploy.getObjectsToRemove.restore();
        awsDeploy.removeObjects.restore();
      });
    });
  });
});
