'use strict';

/* eslint-disable no-unused-expressions */

const AwsProvider = require('../../../../../../lib/plugins/aws/provider');
const AwsDeploy = require('../../../../../../lib/plugins/aws/deploy/index');
const chai = require('chai');
const Serverless = require('../../../../../../lib/Serverless');
const sinon = require('sinon');
const path = require('path');

const runServerless = require('../../../../../utils/run-serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('AwsDeploy', () => {
  let awsDeploy;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.serviceDir = 'foo';
    awsDeploy = new AwsDeploy(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(awsDeploy.serverless).to.equal(serverless);
    });

    it('should set options', () => {
      expect(awsDeploy.options).to.equal(options);
    });

    it('should set the service path if provided', () => {
      expect(awsDeploy.servicePath).to.equal('foo');
    });

    it('should default to an empty service path if not provided', () => {
      serverless.serviceDir = false;
      awsDeploy = new AwsDeploy(serverless, options);

      expect(awsDeploy.servicePath).to.equal('');
    });

    it('should use the options package path if provided', () => {
      options.package = 'package-options';
      awsDeploy = new AwsDeploy(serverless, options);

      expect(awsDeploy.packagePath).to.equal('package-options');
    });

    it('should use the services package path if provided', () => {
      serverless.service = {
        package: {
          path: 'package-service',
        },
      };
      awsDeploy = new AwsDeploy(serverless, options);

      expect(awsDeploy.packagePath).to.equal('package-service');
    });

    it('should default to the .serverless directory as the package path', () => {
      expect(awsDeploy.packagePath).to.equal(path.join('foo', '.serverless'));
    });

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsDeploy.provider).to.be.instanceof(AwsProvider));

    it('should have commands', () => expect(awsDeploy.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);
  });

  describe('hooks', () => {
    let spawnStub;

    beforeEach(() => {
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn');
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
    });

    describe('"before:deploy:deploy" hook', () => {
      let extendedValidateStub;
      let spawnPackageStub;
      let spawnAwsCommonValidateStub;
      let spawnAwsCommonMoveArtifactsToTemp;

      beforeEach(() => {
        extendedValidateStub = sinon.stub(awsDeploy, 'extendedValidate').resolves();
        spawnPackageStub = spawnStub.withArgs('package').resolves();
        spawnAwsCommonValidateStub = spawnStub.withArgs('aws:common:validate').resolves();
        spawnAwsCommonMoveArtifactsToTemp = spawnStub
          .withArgs('aws:common:moveArtifactsToTemp')
          .resolves();
      });

      afterEach(() => {
        awsDeploy.extendedValidate.restore();
      });

      it('should use the default packaging mechanism if no packaging config is provided', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = false;

        return awsDeploy.hooks['before:deploy:deploy']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonValidateStub)).to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledOnce).to.equal(false);
        });
      });

      it('should move the artifacts to the tmp dir if options based config is provided', () => {
        awsDeploy.options.package = true;
        awsDeploy.serverless.service.package.path = false;

        return awsDeploy.hooks['before:deploy:deploy']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(
            spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub)
          ).to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp)).to.equal(
            true
          );
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });

      it('should move the artifacts to the tmp dir if service based config is provided', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = true;

        return awsDeploy.hooks['before:deploy:deploy']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(
            spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub)
          ).to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp)).to.equal(
            true
          );
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });
    });

    it('should run "deploy:finalize" hook', () => {
      const spawnAwsDeployFinalizeStub = spawnStub.withArgs('aws:deploy:finalize').resolves();

      return awsDeploy.hooks['deploy:finalize']().then(() => {
        expect(spawnAwsDeployFinalizeStub.calledOnce).to.equal(true);
      });
    });

    describe('"aws:deploy:finalize:cleanup" hook', () => {
      let cleanupS3BucketStub;
      let spawnAwsCommonCleanupTempDirStub;

      beforeEach(() => {
        cleanupS3BucketStub = sinon.stub(awsDeploy, 'cleanupS3Bucket').resolves();
        spawnAwsCommonCleanupTempDirStub = spawnStub
          .withArgs('aws:common:cleanupTempDir')
          .resolves();
      });

      afterEach(() => {
        awsDeploy.cleanupS3Bucket.restore();
      });

      it('should do the default cleanup if no packaging config is used', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = false;

        return awsDeploy.hooks['aws:deploy:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledOnce).to.equal(false);
        });
      });

      it('should cleanup the tmp dir if options based packaging config is used', () => {
        awsDeploy.options.package = true;
        awsDeploy.serverless.service.package.path = false;

        return awsDeploy.hooks['aws:deploy:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub)).to.equal(true);
        });
      });

      it('should cleanup the tmp dir if service based packaging config is used', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = true;

        return awsDeploy.hooks['aws:deploy:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub)).to.equal(true);
        });
      });

      it('should not cleanup if a deployment was not necessary', () => {
        awsDeploy.serverless.service.provider.shouldNotDeploy = true;

        return awsDeploy.hooks['aws:deploy:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.called).to.equal(false);
          expect(spawnAwsCommonCleanupTempDirStub.called).to.equal(false);
        });
      });
    });
  });
});

describe('test/unit/lib/plugins/aws/deploy/index.test.js', () => {
  const baseAwsRequestStubMap = {
    STS: {
      getCallerIdentity: {
        ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
        UserId: 'XXXXXXXXXXXXXXXXXXXXX',
        Account: '999999999999',
        Arn: 'arn:aws:iam::999999999999:user/test',
      },
    },
  };

  it('with nonexistent stack - first deploy', async () => {
    const describeStacksStub = sinon
      .stub()
      .onFirstCall()
      .throws('error', 'stack does not exist')
      .onSecondCall()
      .resolves({ Stacks: [{}] });
    const createStackStub = sinon.stub().resolves({});
    const s3UploadStub = sinon.stub().resolves();
    const updateStackStub = sinon.stub().resolves({});
    const deleteObjectsStub = sinon.stub().resolves({});
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        deleteObjects: deleteObjectsStub,
        listObjectsV2: { Contents: [] },
        upload: s3UploadStub,
      },
      CloudFormation: {
        describeStacks: describeStacksStub,
        createStack: createStackStub,
        describeStackEvents: {
          StackEvents: [
            {
              EventId: '1e2f3g4h',
              StackName: 'new-service-dev',
              LogicalResourceId: 'new-service-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              Timestamp: new Date(),
              ResourceStatus: 'CREATE_COMPLETE',
            },
          ],
        },
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
        validateTemplate: {},
        updateStack: updateStackStub,
        listStackResources: {},
      },
    };

    await runServerless({
      fixture: 'function',
      command: 'deploy',
      awsRequestStubMap,
    });

    expect(createStackStub).to.be.calledOnce;
    const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
      call[0].Key.endsWith('compiled-cloudformation-template.json')
    );
    expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
    expect(updateStackStub).to.be.calledOnce;
    expect(deleteObjectsStub).not.to.be.called;
  });

  it('with existing stack - subsequent deploy', async () => {
    const s3BucketPrefix = 'serverless/test-aws-deploy-with-existing-stack/dev';
    const createStackStub = sinon.stub().resolves({});
    const s3UploadStub = sinon.stub().resolves();
    const updateStackStub = sinon.stub().resolves({});
    const listObjectsV2Stub = sinon
      .stub()
      .onFirstCall()
      .resolves({ Contents: [] })
      .onSecondCall()
      .resolves({
        Contents: [
          {
            Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
          },
          {
            Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip`,
          },
          {
            Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
          },
          {
            Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/artifact.zip`,
          },
        ],
      });
    const deleteObjectsStub = sinon.stub().resolves();
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        deleteObjects: deleteObjectsStub,
        listObjectsV2: listObjectsV2Stub,
        upload: s3UploadStub,
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        createStack: createStackStub,
        describeStackEvents: {
          StackEvents: [
            {
              EventId: '1e2f3g4h',
              StackName: 'new-service-dev',
              LogicalResourceId: 'new-service-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              Timestamp: new Date(),
              ResourceStatus: 'UPDATE_COMPLETE',
            },
          ],
        },
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
        validateTemplate: {},
        updateStack: updateStackStub,
        listStackResources: {},
      },
    };

    await runServerless({
      fixture: 'function',
      command: 'deploy',
      awsRequestStubMap,
      configExt: {
        // Default, non-deterministic service-name invalidates this test as S3 Bucket cleanup relies on it
        service: 'test-aws-deploy-with-existing-stack',
        provider: {
          deploymentBucket: {
            maxPreviousDeploymentArtifacts: 1,
          },
        },
      },
    });

    expect(createStackStub).to.not.be.called;
    const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
      call[0].Key.endsWith('compiled-cloudformation-template.json')
    );
    expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
    expect(updateStackStub).to.be.calledOnce;
    expect(deleteObjectsStub).to.be.calledWithExactly({
      Bucket: 's3-bucket-resource',
      Delete: {
        Objects: [
          {
            Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
          },
          { Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip` },
        ],
      },
    });
  });

  it('with existing stack - should skip deploy if nothing changed', async () => {
    const createStackStub = sinon.stub().resolves({});
    const s3UploadStub = sinon.stub().resolves();
    const updateStackStub = sinon.stub().resolves({});

    const listObjectsV2Stub = sinon.stub().resolves({
      Contents: [
        {
          Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json',
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
        {
          Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/my-own.zip',
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
      ],
    });
    const s3HeadObjectStub = sinon.stub();
    s3HeadObjectStub
      .withArgs({
        Bucket: 's3-bucket-resource',
        Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json',
      })
      .returns({
        Metadata: { filesha256: 'qxp+iwSTMhcRUfHzka4AE4XAWawS8GnEyBh1WpGb7Vw=' },
      });
    s3HeadObjectStub
      .withArgs({
        Bucket: 's3-bucket-resource',
        Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/my-own.zip',
      })
      .returns({
        Metadata: { filesha256: 'T0qEYHOE4Xv2E8Ar03xGogAlElcdf/dQh/lh9ao7Glo=' },
      });

    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      S3: {
        headObject: s3HeadObjectStub,
        listObjectsV2: listObjectsV2Stub,
        upload: s3UploadStub,
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        createStack: createStackStub,
        describeStackEvents: {
          StackEvents: [
            {
              EventId: '1e2f3g4h',
              StackName: 'new-service-dev',
              LogicalResourceId: 'new-service-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              Timestamp: new Date(),
              ResourceStatus: 'UPDATE_COMPLETE',
            },
          ],
        },
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
        validateTemplate: {},
        updateStack: updateStackStub,
        listStackResources: {},
      },
    };

    const { serverless } = await runServerless({
      fixture: 'packageArtifactInServerlessDir',
      command: 'deploy',
      awsRequestStubMap,
      configExt: {
        // Default, non-deterministic service-name invalidates this test
        service: 'test-aws-deploy-should-be-skipped',
      },
    });

    expect(serverless.service.provider.shouldNotDeploy).to.be.true;
    expect(createStackStub).to.not.be.called;
    expect(updateStackStub).to.not.be.called;
    expect(s3UploadStub).to.not.be.called;
  });
});
