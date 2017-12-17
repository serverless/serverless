'use strict';

/* eslint-disable no-unused-expressions */

const AwsProvider = require('../provider/awsProvider');
const AwsDeploy = require('./index');
const chai = require('chai');
const Serverless = require('../../../Serverless');
const sinon = require('sinon');
const path = require('path');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('AwsDeploy', () => {
  let awsDeploy;
  let serverless;
  let options;

  beforeEach(() => {
    serverless = new Serverless();
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.config.servicePath = 'foo';
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
      serverless.config.servicePath = false;
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
    let createStackStub;
    let setBucketNameStub;
    let checkForChangesStub;

    beforeEach(() => {
      spawnStub = sinon
        .stub(serverless.pluginManager, 'spawn');
      createStackStub = sinon
        .stub(awsDeploy, 'createStack').resolves();
      setBucketNameStub = sinon
        .stub(awsDeploy, 'setBucketName').resolves();
      checkForChangesStub = sinon
        .stub(awsDeploy, 'checkForChanges').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
      awsDeploy.createStack.restore();
      awsDeploy.setBucketName.restore();
      awsDeploy.checkForChanges.restore();
    });

    describe('"before:deploy:deploy" hook', () => {
      let existsDeploymentBucketStub;
      let extendedValidateStub;
      let spawnPackageStub;
      let spawnAwsCommonValidateStub;
      let spawnAwsCommonMoveArtifactsToTemp;

      beforeEach(() => {
        extendedValidateStub = sinon
          .stub(awsDeploy, 'extendedValidate').resolves();
        existsDeploymentBucketStub = sinon
          .stub(awsDeploy, 'existsDeploymentBucket').resolves();
        spawnPackageStub = spawnStub.withArgs('package').resolves();
        spawnAwsCommonValidateStub = spawnStub.withArgs('aws:common:validate').resolves();
        spawnAwsCommonMoveArtifactsToTemp = spawnStub
          .withArgs('aws:common:moveArtifactsToTemp').resolves();
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
          expect(spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub))
            .to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp))
            .to.equal(true);
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });

      it('should move the artifacts to the tmp dir if service based config is provided', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = true;

        return awsDeploy.hooks['before:deploy:deploy']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub))
            .to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp))
            .to.equal(true);
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });

      it('should be called existsDeploymentBucket method if deploymentBucket is provided', () => {
        const bucketName = 'com.serverless.deploys';
        awsDeploy.serverless.service.provider.deploymentBucket = bucketName;
        awsDeploy.options.package = true;
        awsDeploy.serverless.service.package.path = false;

        return awsDeploy.hooks['before:deploy:deploy']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(existsDeploymentBucketStub.calledAfter(spawnAwsCommonValidateStub))
            .to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledAfter(existsDeploymentBucketStub))
            .to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp))
          .to.equal(true);
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });
    });

    it('should run "deploy:deploy" hook', () => {
      const spawnAwsDeployDeployStub = spawnStub.withArgs('aws:deploy:deploy').resolves();

      return awsDeploy.hooks['deploy:deploy']().then(() => {
        expect(spawnAwsDeployDeployStub.calledOnce).to.equal(true);
      });
    });

    it('should run "deploy:finalize" hook', () => {
      const spawnAwsDeployFinalizeStub = spawnStub.withArgs('aws:deploy:finalize').resolves();

      return awsDeploy.hooks['deploy:finalize']().then(() => {
        expect(spawnAwsDeployFinalizeStub.calledOnce).to.equal(true);
      });
    });

    it('should run "aws:deploy:deploy:createStack" hook', () => awsDeploy
      .hooks['aws:deploy:deploy:createStack']().then(() => {
        expect(createStackStub.calledOnce).to.equal(true);
      })
    );

    it('should run "aws:deploy:deploy:checkForChanges" hook', () => awsDeploy
      .hooks['aws:deploy:deploy:checkForChanges']().then(() => {
        expect(setBucketNameStub.calledOnce).to.equal(true);
        expect(checkForChangesStub.calledAfter(setBucketNameStub)).to.equal(true);
      })
    );

    describe('"aws:deploy:deploy:uploadArtifacts" hook', () => {
      let uploadArtifactsStub;

      beforeEach(() => {
        uploadArtifactsStub = sinon
          .stub(awsDeploy, 'uploadArtifacts').resolves();
      });

      afterEach(() => {
        awsDeploy.uploadArtifacts.restore();
      });

      it('should upload the artifacts if a deployment is necessary', () => expect(awsDeploy
        .hooks['aws:deploy:deploy:uploadArtifacts']()).to.be.fulfilled.then(() => {
          expect(uploadArtifactsStub).to.have.been.calledOnce;
        })
      );

      it('should resolve if no deployment is necessary', () => {
        awsDeploy.serverless.service.provider.shouldNotDeploy = true;

        return expect(awsDeploy
          .hooks['aws:deploy:deploy:uploadArtifacts']()).to.be.fulfilled.then(() => {
            expect(uploadArtifactsStub).to.not.have.been.called;
          });
      });
    });

    describe('"aws:deploy:deploy:validateTemplate" hook', () => {
      let validateTemplateStub;

      beforeEach(() => {
        validateTemplateStub = sinon
          .stub(awsDeploy, 'validateTemplate').resolves();
      });

      afterEach(() => {
        awsDeploy.validateTemplate.restore();
      });

      it('should validate the template if a deployment is necessary', () => expect(awsDeploy
        .hooks['aws:deploy:deploy:validateTemplate']()).to.be.fulfilled.then(() => {
          expect(validateTemplateStub).to.have.been.calledOnce;
        })
      );

      it('should resolve if no deployment is necessary', () => {
        awsDeploy.serverless.service.provider.shouldNotDeploy = true;

        return expect(awsDeploy
          .hooks['aws:deploy:deploy:validateTemplate']()).to.be.fulfilled.then(() => {
            expect(validateTemplateStub).to.not.have.been.called;
          });
      });
    });

    describe('"aws:deploy:deploy:updateStack" hook', () => {
      let updateStackStub;

      beforeEach(() => {
        updateStackStub = sinon
          .stub(awsDeploy, 'updateStack').resolves();
      });

      afterEach(() => {
        awsDeploy.updateStack.restore();
      });

      it('should update the stack if a deployment is necessary', () => expect(awsDeploy
        .hooks['aws:deploy:deploy:updateStack']()).to.be.fulfilled.then(() => {
          expect(updateStackStub).to.have.been.calledOnce;
        })
      );

      it('should resolve if no deployment is necessary', () => {
        awsDeploy.serverless.service.provider.shouldNotDeploy = true;

        return expect(awsDeploy
          .hooks['aws:deploy:deploy:updateStack']()).to.be.fulfilled.then(() => {
            expect(updateStackStub).to.not.have.been.called;
          });
      });
    });

    describe('"aws:deploy:finalize:cleanup" hook', () => {
      let cleanupS3BucketStub;
      let spawnAwsCommonCleanupTempDirStub;

      beforeEach(() => {
        cleanupS3BucketStub = sinon
          .stub(awsDeploy, 'cleanupS3Bucket').resolves();
        spawnAwsCommonCleanupTempDirStub = spawnStub.withArgs('aws:common:cleanupTempDir')
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
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub))
            .to.equal(true);
        });
      });

      it('should cleanup the tmp dir if service based packaging config is used', () => {
        awsDeploy.options.package = false;
        awsDeploy.serverless.service.package.path = true;

        return awsDeploy.hooks['aws:deploy:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub))
            .to.equal(true);
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
