'use strict';

const AwsProvider = require('../provider/awsProvider');
const AwsPlan = require('./index');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const expect = require('chai').expect;
const sinon = require('sinon');

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
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.config.servicePath = 'foo';
    serverless.cli = new CLI(serverless);
    awsPlan = new AwsPlan(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => expect(awsPlan.serverless).to.equal(serverless));

    it('should set options', () => expect(awsPlan.options).to.equal(options));

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsPlan.provider).to.be.instanceof(AwsProvider));

    it('should have commands', () => expect(awsPlan.commands).to.be.not.empty);

    it('should have hooks', () => expect(awsPlan.hooks).to.be.not.empty);
  });

  describe('hooks', () => {
    let spawnStub;

    let setBucketNameStub;
    let checkForChangesStub;
    let uploadCloudFormationFileStub;
    let createChangeSetStub;
    let waitForChangeSetCreateCompleteStub;
    let runAnalysisStub;
    let deleteChangeSetStub;
    let deleteChangeSetFromS3Stub;
    let printAnalysisStub;

    beforeEach(() => {
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn');
      setBucketNameStub = sinon.stub(awsPlan, 'setBucketName').resolves();
      checkForChangesStub = sinon.stub(awsPlan, 'checkForChanges').resolves();
      uploadCloudFormationFileStub = sinon.stub(awsPlan, 'uploadCloudFormationFile').resolves();
      createChangeSetStub = sinon.stub(awsPlan, 'createChangeSet').resolves();
      waitForChangeSetCreateCompleteStub = sinon
        .stub(awsPlan, 'waitForChangeSetCreateComplete')
        .resolves();
      runAnalysisStub = sinon.stub(awsPlan, 'runAnalysis').resolves();
      deleteChangeSetStub = sinon.stub(awsPlan, 'deleteChangeSet').resolves();
      deleteChangeSetFromS3Stub = sinon.stub(awsPlan, 'deleteChangeSetFromS3').resolves();
      printAnalysisStub = sinon.stub(awsPlan, 'printAnalysis').resolves();
    });

    afterEach(() => {
      serverless.pluginManager.spawn.restore();
      awsPlan.setBucketName.restore();
      awsPlan.checkForChanges.restore();
      awsPlan.createChangeSet.restore();
      awsPlan.uploadCloudFormationFile.restore();
      awsPlan.waitForChangeSetCreateComplete.restore();
      awsPlan.runAnalysis.restore();
      awsPlan.deleteChangeSet.restore();
      awsPlan.deleteChangeSetFromS3.restore();
      awsPlan.printAnalysis.restore();
    });

    it('should run "before:plan:package" hook', () => {
      return awsPlan.hooks['before:plan:package']().then(() => {
        expect(setBucketNameStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:package" hook', () => {
      const spawnPlanPackageStub = spawnStub.withArgs('package').resolves();
      return awsPlan.hooks['plan:package']().then(() => {
        expect(spawnPlanPackageStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:checkForChanges" hook', () => {
      return awsPlan.hooks['plan:checkForChanges']().then(() => {
        expect(checkForChangesStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:uploadCloudFormationFile" hook', () => {
      return awsPlan.hooks['plan:uploadCloudFormationFile']().then(() => {
        expect(uploadCloudFormationFileStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:createChangeSet" hook', () => {
      return awsPlan.hooks['plan:createChangeSet']().then(() => {
        expect(createChangeSetStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:waitForChangeSetCreateComplete" hook', () => {
      return awsPlan.hooks['plan:waitForChangeSetCreateComplete']().then(() => {
        expect(waitForChangeSetCreateCompleteStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:runAnalysis" hook', () => {
      return awsPlan.hooks['plan:runAnalysis']().then(() => {
        expect(runAnalysisStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:deleteChangeSet" hook', () => {
      return awsPlan.hooks['plan:deleteChangeSet']().then(() => {
        expect(deleteChangeSetStub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:deleteChangeSetFromS3" hook', () => {
      return awsPlan.hooks['plan:deleteChangeSetFromS3']().then(() => {
        expect(deleteChangeSetFromS3Stub.calledOnce).to.equal(true);
      });
    });

    it('should run "plan:printAnalysis" hook', () => {
      return awsPlan.hooks['plan:printAnalysis']().then(() => {
        expect(printAnalysisStub.calledOnce).to.equal(true);
      });
    });
  });
});
