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
    serverless.setProvider('aws', new AwsProvider(serverless));
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
    let updateCloudFormationFilesStub;
    let uploadArtifactsStub;
    let validateTemplateStub;
    let updateStackStub;

    beforeEach(() => {
      spawnStub = sinon
        .stub(serverless.pluginManager, 'spawn');
      createStackStub = sinon
        .stub(awsDeploy, 'createStack').resolves();
      setBucketNameStub = sinon
        .stub(awsDeploy, 'setBucketName').resolves();
      updateCloudFormationFilesStub = sinon
        .stub(awsDeploy, 'updateCloudFormationFiles').resolves();
      uploadArtifactsStub = sinon
        .stub(awsDeploy, 'uploadArtifacts').resolves();
      validateTemplateStub = sinon
        .stub(awsDeploy, 'validateTemplate').resolves();
      updateStackStub = sinon
        .stub(awsDeploy, 'updateStack').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
      awsDeploy.createStack.restore();
      awsDeploy.setBucketName.restore();
      awsDeploy.updateCloudFormationFiles.restore();
      awsDeploy.uploadArtifacts.restore();
      awsDeploy.validateTemplate.restore();
      awsDeploy.updateStack.restore();
    });

    describe('"before:deploy:deploy" hook', () => {
      let extendedValidateStub;
      let spawnPackageStub;
      let spawnAwsCommonValidateStub;
      let spawnAwsCommonMoveArtifactsToTemp;

      beforeEach(() => {
        extendedValidateStub = sinon
          .stub(awsDeploy, 'extendedValidate').resolves();
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

    it('should run "aws:deploy:deploy:uploadArtifacts" hook', () => awsDeploy
      .hooks['aws:deploy:deploy:uploadArtifacts']().then(() => {
        expect(setBucketNameStub.calledOnce).to.equal(true);
        expect(updateCloudFormationFilesStub.calledAfter(setBucketNameStub)).to.equal(true);
        expect(uploadArtifactsStub.calledAfter(updateCloudFormationFilesStub)).to.equal(true);
      })
    );

    it('should run "aws:deploy:deploy:validateTemplate" hook', () => expect(awsDeploy
      .hooks['aws:deploy:deploy:validateTemplate']()).to.be.fulfilled.then(() => {
        expect(validateTemplateStub).to.have.been.calledOnce;
      })
    );

    it('should run "aws:deploy:deploy:updateStack" hook', () => awsDeploy
      .hooks['aws:deploy:deploy:updateStack']().then(() => {
        expect(updateStackStub.calledOnce).to.equal(true);
      })
    );

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
    });
  });
});
