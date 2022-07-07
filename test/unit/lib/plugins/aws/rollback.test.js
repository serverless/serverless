'use strict';

const runServerless = require('../../../../utils/run-serverless');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const AwsRollback = require('../../../../../lib/plugins/aws/rollback');
const Serverless = require('../../../../../lib/serverless');
const chai = require('chai');
const assert = require('chai').assert;
const sinon = require('sinon');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsRollback', () => {
  let awsRollback;
  let s3Key;
  let spawnStub;
  let serverless;
  let provider;

  const createInstance = (options) => {
    serverless = new Serverless({ commands: [], options: {} });
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'rollback';

    spawnStub = sinon.stub(serverless.pluginManager, 'spawn');

    awsRollback = new AwsRollback(serverless, options);
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
    it('should resolve when the timestamp argument is passed as a string', () => {
      createInstance({
        stage: 'dev',
        region: 'us-east-1',
        timestamp: '1476779096930',
      });

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

      sinon.stub(awsRollback.provider, 'request').resolves(s3Response);

      return awsRollback.setStackToUpdate().then(() => {
        expect(awsRollback.serverless.service.package.artifactDirectoryName).to.be.equal(
          'serverless/rollback/dev/1476779096930-2016-10-18T08:24:56.930Z'
        );

        awsRollback.provider.request.restore();
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
          expect(listObjectsStub.calledOnce).to.be.equal(true);
          expect(
            listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            })
          ).to.be.equal(true);
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

      const listObjectsStub = sinon.stub(awsRollback.provider, 'request').resolves(s3Response);

      return awsRollback
        .setStackToUpdate()
        .then(() => {
          assert.isNotOk(true, 'setStackToUpdate should not resolve');
        })
        .catch((error) => {
          expect(error.code).to.equal('ROLLBACK_DEPLOYMENT_NOT_FOUND');
          expect(listObjectsStub.calledOnce).to.be.equal(true);
          expect(
            listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
              Bucket: awsRollback.bucketName,
              Prefix: `${s3Key}`,
            })
          ).to.be.equal(true);
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

      const listObjectsStub = sinon.stub(awsRollback.provider, 'request').resolves(s3Response);

      return awsRollback.setStackToUpdate().then(() => {
        expect(awsRollback.serverless.service.package.artifactDirectoryName).to.be.equal(
          'serverless/rollback/dev/1476779096930-2016-10-18T08:24:56.930Z'
        );
        expect(
          listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
            Bucket: awsRollback.bucketName,
            Prefix: `${s3Key}`,
          })
        ).to.be.equal(true);
        awsRollback.provider.request.restore();
      });
    });
  });
});

describe('test/unit/lib/plugins/aws/rollback.test.js', () => {
  it('Should gently handle error of listing objects from S3 bucket', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'rollback',
        awsRequestStubMap: {
          CloudFormation: {
            describeStacks: {},
            describeStackResource: {
              StackResourceDetail: { PhysicalResourceId: 'deployment-bucket' },
            },
          },
          STS: {
            getCallerIdentity: {
              ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
              UserId: 'XXXXXXXXXXXXXXXXXXXXX',
              Account: '999999999999',
              Arn: 'arn:aws:iam::999999999999:user/test',
            },
          },
          S3: {
            headObject: () => {},
            headBucket: () => {},
            listObjectsV2: () => {
              const err = new Error('error!');
              err.code = 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED';
              throw err;
            },
          },
        },
      })
    ).to.eventually.be.rejected.and.have.property('code', 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED');
  });
});
