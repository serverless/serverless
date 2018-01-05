
'use strict';

const AwsProvider = require('../provider/awsProvider');
const AwsCommon = require('./index');
const Serverless = require('../../../Serverless');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('AwsCommon', () => {
  let awsCommon;
  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.config.servicePath = 'foo';
    awsCommon = new AwsCommon(serverless, options);
    awsCommon.serverless.cli = new serverless.classes.CLI();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsCommon.hooks).to.be.not.empty);

    it('should have commands', () => expect(awsCommon.commands).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCommon.provider).to.be.instanceof(AwsProvider));
  });

  describe('hooks', () => {
    describe('aws:common:validate:validate', () => {
      it('should call validate', () => {
        const validateStub = sinon
          .stub(awsCommon, 'validate').resolves();

        return awsCommon.hooks['aws:common:validate:validate']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
        });
      });
    });

    describe('aws:common:cleanupTempDir:cleanup', () => {
      it('should call cleanupTempDir', () => {
        const cleanupTempDirStub = sinon
          .stub(awsCommon, 'cleanupTempDir').resolves();

        return awsCommon.hooks['aws:common:cleanupTempDir:cleanup']().then(() => {
          expect(cleanupTempDirStub.calledOnce).to.be.equal(true);
        });
      });
    });

    describe('aws:common:moveArtifactsToPackage:move', () => {
      it('should call cleanupTempDir', () => {
        const moveArtifactsToPackageStub = sinon
          .stub(awsCommon, 'moveArtifactsToPackage').resolves();

        return awsCommon.hooks['aws:common:moveArtifactsToPackage:move']().then(() => {
          expect(moveArtifactsToPackageStub.calledOnce).to.be.equal(true);
        });
      });
    });

    describe('aws:common:moveArtifactsToTemp:move', () => {
      it('should call cleanupTempDir', () => {
        const moveArtifactsToTempStub = sinon
          .stub(awsCommon, 'moveArtifactsToTemp').resolves();

        return awsCommon.hooks['aws:common:moveArtifactsToTemp:move']().then(() => {
          expect(moveArtifactsToTempStub.calledOnce).to.be.equal(true);
        });
      });
    });
  });

  describe('commands', () => {
    it('should be only entrypoints', () => {
      expect(awsCommon.commands).to.have.deep.property('aws.type', 'entrypoint');
    });

    describe('aws:common:validate', () => {
      it('should exist', () => {
        expect(awsCommon.commands)
          .to.have.deep.property('aws.commands.common.commands.validate');
      });
    });

    describe('aws:common:cleanupTempDir', () => {
      it('should exist', () => {
        expect(awsCommon.commands)
          .to.have.deep.property('aws.commands.common.commands.cleanupTempDir');
      });
    });

    describe('aws:common:moveArtifactsToPackage', () => {
      it('should exist', () => {
        expect(awsCommon.commands)
          .to.have.deep.property('aws.commands.common.commands.moveArtifactsToPackage');
      });
    });

    describe('aws:common:moveArtifactsToTemp', () => {
      it('should exist', () => {
        expect(awsCommon.commands)
          .to.have.deep.property('aws.commands.common.commands.moveArtifactsToTemp');
      });
    });
  });
});
