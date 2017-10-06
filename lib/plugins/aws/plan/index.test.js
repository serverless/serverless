'use strict';

/* eslint-disable no-unused-expressions */

const AwsProvider = require('../provider/awsProvider');
const AwsPlan = require('./index');
const chai = require('chai');
const Serverless = require('../../../Serverless');
const sinon = require('sinon');
const path = require('path');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('AwsPlan', () => {
  let awsPlan;
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
    awsPlan = new AwsPlan(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(awsPlan.serverless).to.equal(serverless);
    });

    it('should set options', () => {
      expect(awsPlan.options).to.equal(options);
    });

    it('should set the service path if provided', () => {
      expect(awsPlan.servicePath).to.equal('foo');
    });

    it('should default to an empty service path if not provided', () => {
      serverless.config.servicePath = false;
      awsPlan = new AwsPlan(serverless, options);

      expect(awsPlan.servicePath).to.equal('');
    });

    it('should use the options package path if provided', () => {
      options.package = 'package-options';
      awsPlan = new AwsPlan(serverless, options);

      expect(awsPlan.packagePath).to.equal('package-options');
    });

    it('should use the services package path if provided', () => {
      serverless.service = {
        package: {
          path: 'package-service',
        },
      };
      awsPlan = new AwsPlan(serverless, options);

      expect(awsPlan.packagePath).to.equal('package-service');
    });

    it('should default to the .serverless directory as the package path', () => {
      expect(awsPlan.packagePath).to.equal(path.join('foo', '.serverless'));
    });

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsPlan.provider).to.be.instanceof(AwsProvider));

    it('should have commands', () => expect(awsPlan.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsPlan.hooks).to.be.not.empty);
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
        .stub(awsPlan, 'createStack').resolves();
      setBucketNameStub = sinon
        .stub(awsPlan, 'setBucketName').resolves();
      checkForChangesStub = sinon
        .stub(awsPlan, 'checkForChanges').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
      awsPlan.createStack.restore();
      awsPlan.setBucketName.restore();
      awsPlan.checkForChanges.restore();
    });

    describe('"before:plan:plan" hook', () => {
      let extendedValidateStub;
      let spawnPackageStub;
      let spawnAwsCommonValidateStub;
      let spawnAwsCommonMoveArtifactsToTemp;

      beforeEach(() => {
        extendedValidateStub = sinon
          .stub(awsPlan, 'extendedValidate').resolves();
        spawnPackageStub = spawnStub.withArgs('package').resolves();
        spawnAwsCommonValidateStub = spawnStub.withArgs('aws:common:validate').resolves();
        spawnAwsCommonMoveArtifactsToTemp = spawnStub
          .withArgs('aws:common:moveArtifactsToTemp').resolves();
      });

      afterEach(() => {
        awsPlan.extendedValidate.restore();
      });

      it('should use the default packaging mechanism if no packaging config is provided', () => {
        awsPlan.options.package = false;
        awsPlan.serverless.service.package.path = false;

        return awsPlan.hooks['before:plan:plan']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonValidateStub)).to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledOnce).to.equal(false);
        });
      });

      it('should move the artifacts to the tmp dir if options based config is provided', () => {
        awsPlan.options.package = true;
        awsPlan.serverless.service.package.path = false;

        return awsPlan.hooks['before:plan:plan']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub))
            .to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp))
            .to.equal(true);
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });

      it('should move the artifacts to the tmp dir if service based config is provided', () => {
        awsPlan.options.package = false;
        awsPlan.serverless.service.package.path = true;

        return awsPlan.hooks['before:plan:plan']().then(() => {
          expect(spawnAwsCommonValidateStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonMoveArtifactsToTemp.calledAfter(spawnAwsCommonValidateStub))
            .to.equal(true);
          expect(extendedValidateStub.calledAfter(spawnAwsCommonMoveArtifactsToTemp))
            .to.equal(true);
          expect(spawnPackageStub.calledOnce).to.equal(false);
        });
      });
    });

    it('should run "plan:plan" hook', () => {
      const spawnAwsPlanDeployStub = spawnStub.withArgs('aws:plan:plan').resolves();

      return awsPlan.hooks['plan:plan']().then(() => {
        expect(spawnAwsPlanDeployStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:finalize" hook', () => {
      const spawnAwsPlanFinalizeStub = spawnStub.withArgs('aws:plan:finalize').resolves();

      return awsPlan.hooks['plan:finalize']().then(() => {
        expect(spawnAwsPlanFinalizeStub.calledOnce).to.equal(true);
      });
    });

    it('should run "aws:plan:plan:createStack" hook', () => awsPlan
      .hooks['aws:plan:plan:createStack']().then(() => {
        expect(createStackStub.calledOnce).to.equal(true);
      })
    );

    it('should run "aws:plan:plan:checkForChanges" hook', () => awsPlan
      .hooks['aws:plan:plan:checkForChanges']().then(() => {
        expect(setBucketNameStub.calledOnce).to.equal(true);
        expect(checkForChangesStub.calledAfter(setBucketNameStub)).to.equal(true);
      })
    );

    describe('"aws:plan:plan:validateTemplate" hook', () => {
      let validateTemplateStub;

      beforeEach(() => {
        validateTemplateStub = sinon
          .stub(awsPlan, 'validateTemplate').resolves();
      });

      afterEach(() => {
        awsPlan.validateTemplate.restore();
      });

      it('should validate the template if a deployment is necessary', () => expect(awsPlan
        .hooks['aws:plan:plan:validateTemplate']()).to.be.fulfilled.then(() => {
          expect(validateTemplateStub).to.have.been.calledOnce;
        })
      );

      it('should resolve if no deployment is necessary', () => {
        awsPlan.serverless.service.provider.shouldNotDeploy = true;

        return expect(awsPlan
          .hooks['aws:plan:plan:validateTemplate']()).to.be.fulfilled.then(() => {
            expect(validateTemplateStub).to.not.have.been.called;
          });
      });
    });

    describe('"aws:plan:finalize:cleanup" hook', () => {
      let cleanupS3BucketStub;
      let spawnAwsCommonCleanupTempDirStub;

      beforeEach(() => {
        cleanupS3BucketStub = sinon
          .stub(awsPlan, 'cleanupS3Bucket').resolves();
        spawnAwsCommonCleanupTempDirStub = spawnStub.withArgs('aws:common:cleanupTempDir')
          .resolves();
      });

      afterEach(() => {
        awsPlan.cleanupS3Bucket.restore();
      });

      it('should do the default cleanup if no packaging config is used', () => {
        awsPlan.options.package = false;
        awsPlan.serverless.service.package.path = false;

        return awsPlan.hooks['aws:plan:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledOnce).to.equal(false);
        });
      });

      it('should cleanup the tmp dir if options based packaging config is used', () => {
        awsPlan.options.package = true;
        awsPlan.serverless.service.package.path = false;

        return awsPlan.hooks['aws:plan:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub))
            .to.equal(true);
        });
      });

      it('should cleanup the tmp dir if service based packaging config is used', () => {
        awsPlan.options.package = false;
        awsPlan.serverless.service.package.path = true;

        return awsPlan.hooks['aws:plan:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.calledOnce).to.equal(true);
          expect(spawnAwsCommonCleanupTempDirStub.calledAfter(cleanupS3BucketStub))
            .to.equal(true);
        });
      });

      it('should not cleanup if a deployment was not necessary', () => {
        awsPlan.serverless.service.provider.shouldNotDeploy = true;

        return awsPlan.hooks['aws:plan:finalize:cleanup']().then(() => {
          expect(cleanupS3BucketStub.called).to.equal(false);
          expect(spawnAwsCommonCleanupTempDirStub.called).to.equal(false);
        });
      });
    });
  });
});
