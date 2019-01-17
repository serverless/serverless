'use strict';

/* eslint-disable no-unused-expressions */

const fs = require('fs');
const path = require('path');
const globby = require('globby');
const sinon = require('sinon');
const chai = require('chai');
const BbPromise = require('bluebird');
const proxyquire = require('proxyquire');
const normalizeFiles = require('../../lib/normalizeFiles');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('checkForChanges', () => {
  let serverless;
  let provider;
  let awsDeploy;
  let s3Key;
  let cryptoStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.config.servicePath = 'my-service';
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'my-service';
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
      foo: 'bar',
    };
    s3Key = `serverless/${serverless.service.service}/${provider.getStage()}`;
    awsDeploy.serverless.cli = { log: sinon.spy() };
    cryptoStub = {
      createHash: function () { return this; }, // eslint-disable-line
      update: function () { return this; }, // eslint-disable-line
      digest: sinon.stub(),
    };
    const checkForChanges = proxyquire('./checkForChanges.js', {
      crypto: cryptoStub,
    });
    Object.assign(
      awsDeploy,
      checkForChanges
    );
  });

  describe('#checkForChanges()', () => {
    let getMostRecentObjectsStub;
    let getObjectMetadataStub;
    let checkIfDeploymentIsNecessaryStub;
    let checkLogGroupSubscriptionFilterResourceLimitExceededStub;

    beforeEach(() => {
      getMostRecentObjectsStub = sinon
        .stub(awsDeploy, 'getMostRecentObjects').resolves();
      getObjectMetadataStub = sinon
        .stub(awsDeploy, 'getObjectMetadata').resolves();
      checkIfDeploymentIsNecessaryStub = sinon
        .stub(awsDeploy, 'checkIfDeploymentIsNecessary').resolves();
      checkLogGroupSubscriptionFilterResourceLimitExceededStub = sinon
        .stub(awsDeploy, 'checkLogGroupSubscriptionFilterResourceLimitExceeded').resolves();
    });

    afterEach(() => {
      awsDeploy.getMostRecentObjects.restore();
      awsDeploy.getObjectMetadata.restore();
      awsDeploy.checkIfDeploymentIsNecessary.restore();
      awsDeploy.checkLogGroupSubscriptionFilterResourceLimitExceeded.restore();
    });

    it('should run promise chain in order', () => expect(awsDeploy.checkForChanges())
      .to.be.fulfilled.then(() => {
        expect(getMostRecentObjectsStub).to.have.been.calledOnce;
        expect(getObjectMetadataStub).to.have.been.calledAfter(getMostRecentObjectsStub);
        expect(checkIfDeploymentIsNecessaryStub).to.have.been.calledAfter(getObjectMetadataStub);
        expect(checkLogGroupSubscriptionFilterResourceLimitExceededStub).to.have.been
          .calledAfter(checkIfDeploymentIsNecessaryStub);

        expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(false);
      })
    );

    it('should resolve if the "force" option is used', () => {
      awsDeploy.options.force = true;

      return expect(awsDeploy.checkForChanges())
        .to.be.fulfilled.then(() => {
          expect(getMostRecentObjectsStub).to.not.have.been.called;
          expect(getObjectMetadataStub).to.not.have.been.called;
          expect(checkIfDeploymentIsNecessaryStub).to.not.have.been.called;

          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(false);
        });
    });
  });

  describe('#getMostRecentObjects()', () => {
    let listObjectsV2Stub;

    beforeEach(() => {
      listObjectsV2Stub = sinon
        .stub(awsDeploy.provider, 'request');
    });

    afterEach(() => {
      awsDeploy.provider.request.restore();
    });

    it('should resolve if no result is returned', () => {
      listObjectsV2Stub.resolves();

      return expect(awsDeploy.getMostRecentObjects()).to.be.fulfilled.then((result) => {
        expect(listObjectsV2Stub).to.have.been.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeploy.bucketName,
            Prefix: 'serverless/my-service/dev',
          }
        );
        expect(result).to.deep.equal([]);
      });
    });

    it('should translate error if rejected due to missing bucket', () => {
      listObjectsV2Stub
        .rejects(new serverless.classes.Error('The specified bucket does not exist'));

      return expect(awsDeploy.getMostRecentObjects()).to.be.rejectedWith([
        `The serverless deployment bucket "${awsDeploy.bucketName}" does not exist.`,
        'Create it manually if you want to reuse the CloudFormation stack "my-service-dev",',
        'or delete the stack if it is no longer required.',
      ].join(' '));
    });

    it('should throw original error if rejected not due to missing bucket', () => {
      listObjectsV2Stub
        .rejects(new serverless.classes.Error('Other reason'));
      return expect(awsDeploy.getMostRecentObjects()).to.be.rejectedWith('Other reason');
    });

    it('should resolve if result array is empty', () => {
      const serviceObjects = {
        Contents: [],
      };

      listObjectsV2Stub.resolves(serviceObjects);

      return expect(awsDeploy.getMostRecentObjects()).to.be.fulfilled.then((result) => {
        expect(listObjectsV2Stub).to.have.been.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeploy.bucketName,
            Prefix: 'serverless/my-service/dev',
          }
        );
        expect(result).to.deep.equal([]);
      });
    });

    it('should resolve with the most recently deployed objects', () => {
      const serviceObjects = {
        Contents: [
          { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/artifact.zip` },
          { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/cloudformation.json` },
          { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/cloudformation.json` },
        ],
      };

      listObjectsV2Stub.resolves(serviceObjects);

      return expect(awsDeploy.getMostRecentObjects()).to.be.fulfilled.then((result) => {
        expect(listObjectsV2Stub).to.have.been.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeploy.bucketName,
            Prefix: 'serverless/my-service/dev',
          }
        );
        expect(result).to.deep.equal([
          { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/cloudformation.json` },
          { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/artifact.zip` },
        ]);
      });
    });
  });

  describe('#getObjectMetadata()', () => {
    let headObjectStub;

    beforeEach(() => {
      headObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();
    });

    afterEach(() => {
      awsDeploy.provider.request.restore();
    });

    it('should resolve if no input is provided', () => expect(awsDeploy.getObjectMetadata())
      .to.be.fulfilled.then((result) => {
        expect(headObjectStub).to.not.have.been.called;
        expect(result).to.deep.equal([]);
      })
    );

    it('should resolve if no objects are provided as input', () => {
      const input = [];

      return expect(awsDeploy.getObjectMetadata(input)).to.be.fulfilled.then((result) => {
        expect(headObjectStub).to.not.have.been.called;
        expect(result).to.deep.equal([]);
      });
    });

    it('should request the object detailed information', () => {
      const input = [
        { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/artifact.zip` },
        { Key: `${s3Key}/151224711231-2016-08-18T15:43:00/cloudformation.json` },
        { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/artifact.zip` },
        { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/cloudformation.json` },
      ];

      return expect(awsDeploy.getObjectMetadata(input)).to.be.fulfilled.then(() => {
        expect(headObjectStub.callCount).to.equal(4);
        expect(headObjectStub).to.have.been.calledWithExactly(
          'S3',
          'headObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${s3Key}/151224711231-2016-08-18T15:43:00/artifact.zip`,
          }
        );
        expect(headObjectStub).to.have.been.calledWithExactly(
          'S3',
          'headObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${s3Key}/151224711231-2016-08-18T15:43:00/cloudformation.json`,
          }
        );
        expect(headObjectStub).to.have.been.calledWithExactly(
          'S3',
          'headObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${s3Key}/141264711231-2016-08-18T15:42:00/artifact.zip`,
          }
        );
        expect(headObjectStub).to.have.been.calledWithExactly(
          'S3',
          'headObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${s3Key}/141264711231-2016-08-18T15:42:00/cloudformation.json`,
          }
        );
      });
    });
  });

  describe('#checkIfDeploymentIsNecessary()', () => {
    let normalizeCloudFormationTemplateStub;
    let globbySyncStub;
    let readFileSyncStub;

    beforeEach(() => {
      normalizeCloudFormationTemplateStub = sinon
        .stub(normalizeFiles, 'normalizeCloudFormationTemplate')
        .returns();
      globbySyncStub = sinon
        .stub(globby, 'sync');
      readFileSyncStub = sinon
        .stub(fs, 'readFileSync')
        .returns();
    });

    afterEach(() => {
      normalizeFiles.normalizeCloudFormationTemplate.restore();
      globby.sync.restore();
      fs.readFileSync.restore();
    });

    it('should resolve if no input is provided', () => expect(awsDeploy
      .checkIfDeploymentIsNecessary()).to.be.fulfilled.then(() => {
        expect(normalizeCloudFormationTemplateStub).to.not.have.been.called;
        expect(globbySyncStub).to.not.have.been.called;
        expect(readFileSyncStub).to.not.have.been.called;
        expect(awsDeploy.serverless.cli.log).to.not.have.been.called;
      })
    );

    it('should resolve if no objects are provided as input', () => {
      const input = [];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.not.have.been.called;
          expect(globbySyncStub).to.not.have.been.called;
          expect(readFileSyncStub).to.not.have.been.called;
          expect(awsDeploy.serverless.cli.log).to.not.have.been.called;
        });
    });

    it('should not set a flag if there are more remote hashes', () => {
      globbySyncStub.returns(['my-service.zip']);
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-cf-template');
      cryptoStub.createHash().update().digest.onCall(1).returns('local-hash-zip-file-1');

      const input = [
        { Metadata: { filesha256: 'remote-hash-cf-template' } },
        { Metadata: { filesha256: 'remote-hash-zip-file-1' } },
        { Metadata: { /* no filesha256 available */ } }, // will be translated to ''
      ];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
          expect(globbySyncStub).to.have.been.calledOnce;
          expect(readFileSyncStub).to.have.been.calledOnce;
          expect(awsDeploy.serverless.cli.log).to.not.have.been.called;
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly(
            awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          );
          expect(globbySyncStub).to.have.been.calledWithExactly(
            ['**.zip'],
            {
              cwd: path.join(awsDeploy.serverless.config.servicePath, '.serverless'),
              dot: true,
              silent: true,
            }
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/my-service.zip')
          );
          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(undefined);
        });
    });

    it('should not set a flag if remote and local hashes are different', () => {
      globbySyncStub.returns(['my-service.zip']);
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-cf-template');
      cryptoStub.createHash().update().digest.onCall(1).returns('local-hash-zip-file-1');

      const input = [
        { Metadata: { filesha256: 'remote-hash-cf-template' } },
        { Metadata: { filesha256: 'remote-hash-zip-file-1' } },
      ];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
          expect(globbySyncStub).to.have.been.calledOnce;
          expect(readFileSyncStub).to.have.been.calledOnce;
          expect(awsDeploy.serverless.cli.log).to.not.have.been.called;
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly(
            awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          );
          expect(globbySyncStub).to.have.been.calledWithExactly(
            ['**.zip'],
            {
              cwd: path.join(awsDeploy.serverless.config.servicePath, '.serverless'),
              dot: true,
              silent: true,
            }
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/my-service.zip')
          );
          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(undefined);
        });
    });

    it('should not set a flag if remote and local hashes are the same but are duplicated', () => {
      globbySyncStub.returns(['func1.zip', 'func2.zip']);
      cryptoStub.createHash().update().digest.onCall(0).returns('remote-hash-cf-template');
      // happens when package.individually is used
      cryptoStub.createHash().update().digest.onCall(1).returns('remote-hash-zip-file-1');
      cryptoStub.createHash().update().digest.onCall(2).returns('remote-hash-zip-file-1');

      const input = [
        { Metadata: { filesha256: 'remote-hash-cf-template' } },
        { Metadata: { filesha256: 'remote-hash-zip-file-1' } },
      ];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
          expect(globbySyncStub).to.have.been.calledOnce;
          expect(readFileSyncStub).to.have.been.calledTwice;
          expect(awsDeploy.serverless.cli.log).to.not.have.been.called;
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly(
            awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          );
          expect(globbySyncStub).to.have.been.calledWithExactly(
            ['**.zip'],
            {
              cwd: path.join(awsDeploy.serverless.config.servicePath, '.serverless'),
              dot: true,
              silent: true,
            }
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/func1.zip')
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/func2.zip')
          );
          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(undefined);
        });
    });

    it('should set a flag if the remote and local hashes are equal', () => {
      globbySyncStub.returns(['my-service.zip']);
      cryptoStub.createHash().update().digest.onCall(0).returns('hash-cf-template');
      cryptoStub.createHash().update().digest.onCall(1).returns('hash-zip-file-1');

      const input = [
        { Metadata: { filesha256: 'hash-cf-template' } },
        { Metadata: { filesha256: 'hash-zip-file-1' } },
      ];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
          expect(globbySyncStub).to.have.been.calledOnce;
          expect(readFileSyncStub).to.have.been.calledOnce;
          expect(awsDeploy.serverless.cli.log).to.have.been.calledOnce;
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly(
            awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          );
          expect(globbySyncStub).to.have.been.calledWithExactly(
            ['**.zip'],
            {
              cwd: path.join(awsDeploy.serverless.config.servicePath, '.serverless'),
              dot: true,
              silent: true,
            }
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/my-service.zip')
          );
          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(true);
        });
    });

    it('should set a flag if the remote and local hashes are duplicated and equal', () => {
      globbySyncStub.returns(['func1.zip', 'func2.zip']);
      cryptoStub.createHash().update().digest.onCall(0).returns('hash-cf-template');
      // happens when package.individually is used
      cryptoStub.createHash().update().digest.onCall(1).returns('hash-zip-file-1');
      cryptoStub.createHash().update().digest.onCall(2).returns('hash-zip-file-1');

      const input = [
        { Metadata: { filesha256: 'hash-cf-template' } },
        { Metadata: { filesha256: 'hash-zip-file-1' } },
        { Metadata: { filesha256: 'hash-zip-file-1' } },
      ];

      return expect(awsDeploy.checkIfDeploymentIsNecessary(input))
        .to.be.fulfilled.then(() => {
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
          expect(globbySyncStub).to.have.been.calledOnce;
          expect(readFileSyncStub).to.have.been.calledTwice;
          expect(awsDeploy.serverless.cli.log).to.have.been.calledOnce;
          expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly(
            awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          );
          expect(globbySyncStub).to.have.been.calledWithExactly(
            ['**.zip'],
            {
              cwd: path.join(awsDeploy.serverless.config.servicePath, '.serverless'),
              dot: true,
              silent: true,
            }
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/func1.zip')
          );
          expect(readFileSyncStub).to.have.been.calledWithExactly(
            path.join('my-service/.serverless/func2.zip')
          );
          expect(awsDeploy.serverless.service.provider.shouldNotDeploy).to.equal(true);
        });
    });
  });

  describe('#checkLogGroupSubscriptionFilterResourceLimitExceeded', () => {
    let CloudWatchLogsStub;
    let deleteSubscriptionFilterStub;
    const accountId = '123456789';
    const serviceName = 'my-service';
    const region = 'us-east-1';
    let describeSubscriptionFiltersResponse = {};
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();

      CloudWatchLogsStub = class {
        constructor() {
          this.deleteSubscriptionFilter = deleteSubscriptionFilterStub = sinon.spy(() => ({
            promise: () => BbPromise.resolve(),
          }));

          this.describeSubscriptionFilters = sinon.spy(() => ({
            promise: () => BbPromise.resolve(describeSubscriptionFiltersResponse),
          }));
        }
      };

      provider.sdk.CloudWatchLogs = CloudWatchLogsStub;

      sandbox.stub(provider, 'getAccountId')
        .returns(BbPromise.resolve(accountId));

      sandbox.stub(awsDeploy.serverless.service, 'getServiceName')
        .returns(serviceName);

      sandbox.stub(awsDeploy, 'getMostRecentObjects').resolves();
      sandbox.stub(awsDeploy, 'getObjectMetadata').resolves();
      sandbox.stub(awsDeploy, 'checkIfDeploymentIsNecessary').resolves();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should not call checkLogGroup if deployment is not required', () => {
      awsDeploy.checkIfDeploymentIsNecessary.restore();

      sandbox.stub(awsDeploy, 'checkIfDeploymentIsNecessary', () => new Promise((resolve) => {
        awsDeploy.serverless.service.provider.shouldNotDeploy = true;
        resolve();
      }));

      const spy = sinon.spy(awsDeploy, 'checkLogGroupSubscriptionFilterResourceLimitExceeded');

      return awsDeploy.checkForChanges().then(() => {
        expect(spy).to.not.have.been.called;
      });
    });

    it('should work normally when there are functions without events', () => {
      awsDeploy.serverless.service.functions = {
        first: {},
      };

      expect(awsDeploy.checkForChanges()).to.be.fulfilled;
    });

    it('should work normally when there are functions events that are not cloudWwatchLog', () => {
      awsDeploy.serverless.service.functions = {
        first: {
          events: [
            { dummyEvent: 'test' },
          ],
        },
      };

      expect(awsDeploy.checkForChanges()).to.be.fulfilled;
    });

    describe('option to force update is set', () => {
      beforeEach(() => {
        awsDeploy.serverless.service.provider.cloudWatchLogs = {};
      });

      afterEach(() => {
        awsDeploy.serverless.service.provider.cloudWatchLogs = undefined;
      });

      it('should not call delete if there are no subscriptionFilters', () => {
        awsDeploy.serverless.service.functions = {
          first: {
            events: [
              { cloudwatchLog: '/aws/lambda/hello1' },
            ],
          },
        };

        describeSubscriptionFiltersResponse = {
          subscriptionFilters: [],
        };

        return awsDeploy.checkForChanges().then(() => {
          expect(deleteSubscriptionFilterStub).to.not.have.been.called;
        });
      });

      it('should not call delete if there is a subFilter and the ARNs are the same', () => {
        awsDeploy.serverless.service.functions = {
          first: {
            events: [
              { cloudwatchLog: '/aws/lambda/hello1' },
            ],
          },
        };

        describeSubscriptionFiltersResponse = {
          subscriptionFilters: [
            {
              destinationArn:
                `arn:aws:lambda:${region}:${accountId}:function:${serviceName}-dev-first`,
              filterName: 'dummy-filter',
            },
          ],
        };

        return awsDeploy.checkForChanges().then(() => {
          expect(deleteSubscriptionFilterStub).to.not.have.been.called;
        });
      });

      it('should call delete if there is a subFilter but the ARNs are not the same', () => {
        awsDeploy.serverless.service.functions = {
          first: {
            events: [
              { cloudwatchLog: '/aws/lambda/hello1' },
            ],
          },
        };

        describeSubscriptionFiltersResponse = {
          subscriptionFilters: [
            {
              destinationArn:
                `arn:aws:lambda:${region}:${accountId}:function:${serviceName}-dev-not-first`,
              filterName: 'dummy-filter',
            },
          ],
        };

        return awsDeploy.checkForChanges().then(() => {
          expect(deleteSubscriptionFilterStub).to.have.been.called;
        });
      });
    });
  });
});
