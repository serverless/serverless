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

    it('should call planning functions if plan command called', () => {
      awsPlan.planning = true;
      return awsPlan.callIfPlanning([() => true]).then(result => expect(result).to.be.true);
    });

    it('should not call planning functions if plan command not called', () => {
      return awsPlan.callIfPlanning([() => true]).then(result => expect(result).to.be.undefined);
    });
  });

  describe('hooks', () => {
    let spawnStub;
    let lockStackDeploymentStub;
    let unlockStackDeploymentStub;

    let setBucketNameStub;
    let createChangeSetStub;
    let waitForChangeSetCreateCompleteStub;
    let runAnalysisStub;
    let deleteChangeSetStub;
    let deleteChangeSetFromS3Stub;
    let printAnalysisStub;

    beforeEach(() => {
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn');
      lockStackDeploymentStub = sinon.stub(awsPlan, 'lockStackDeployment').resolves();
      unlockStackDeploymentStub = sinon.stub(awsPlan, 'unlockStackDeployment').resolves();
      setBucketNameStub = sinon.stub(awsPlan, 'setBucketName').resolves();
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
      awsPlan.lockStackDeployment.restore();
      awsPlan.unlockStackDeployment.restore();
      awsPlan.setBucketName.restore();
      awsPlan.createChangeSet.restore();
      awsPlan.waitForChangeSetCreateComplete.restore();
      awsPlan.runAnalysis.restore();
      awsPlan.deleteChangeSet.restore();
      awsPlan.deleteChangeSetFromS3.restore();
      awsPlan.printAnalysis.restore();
    });

    it('should run "plan:deploy" hook', () => {
      const spawnPlanDeployStub = spawnStub.withArgs('deploy').resolves();
      return awsPlan.hooks['plan:deploy']().then(() => {
        expect(awsPlan.planning).to.be.true;
        expect(spawnPlanDeployStub.calledOnce).to.equal(true);
      });
    });

    it('should run "before:aws:deploy:deploy:updateStack" hook', () => {
      return awsPlan.hooks['before:aws:deploy:deploy:updateStack']().then(() => {
        expect(lockStackDeploymentStub.calledOnce).to.equal(true);
      });
    });

    it('should run "aws:deploy:deploy:updateStack" hook', () => {
      awsPlan.planning = true;
      return awsPlan.hooks['aws:deploy:deploy:updateStack']().then(() => {
        expect(setBucketNameStub.calledOnce).to.equal(true);
        expect(createChangeSetStub.calledOnce).to.equal(true);
        expect(waitForChangeSetCreateCompleteStub.calledOnce).to.equal(true);
        expect(runAnalysisStub.calledOnce).to.equal(true);
        expect(deleteChangeSetStub.calledOnce).to.equal(true);
        expect(deleteChangeSetFromS3Stub.calledOnce).to.equal(true);
      });
    });

    it('should run "after:aws:deploy:deploy:updateStack" hook', () => {
      awsPlan.planning = true;
      return awsPlan.hooks['after:aws:deploy:deploy:updateStack']().then(() => {
        expect(unlockStackDeploymentStub.calledOnce).to.equal(true);
      });
    });

    it('should run "after:deploy:deploy" hook', () => {
      awsPlan.planning = true;
      return awsPlan.hooks['after:deploy:deploy']().then(() => {
        expect(printAnalysisStub.calledOnce).to.equal(true);
      });
    });
  });
});
