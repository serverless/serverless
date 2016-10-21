'use strict';

const AwsProvider = require('../../provider/awsProvider');
const AwsRollback = require('../index');
const Serverless = require('../../../../Serverless');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');

describe('AwsRollback', () => {
  let awsDeploy;
  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsDeploy = new AwsRollback(serverless, options);
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsDeploy.provider).to.be.instanceof(AwsProvider));
  });

  describe('hooks', () => {
    it('should run "before:rollback:initialize" hook promise chain in order', () => {
      const validateStub = sinon.stub(awsDeploy, 'validate').returns(BbPromise.resolve());

      return awsDeploy.hooks['before:rollback:initialize']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
      });
    });

    it('should run "rollback:rollback" promise chain in order', () => {
      const setBucketNameStub = sinon
        .stub(awsDeploy, 'setBucketName').returns(BbPromise.resolve());
      const setStackToUpdateStub = sinon
        .stub(awsDeploy, 'setStackToUpdate').returns(BbPromise.resolve());
      const updateStackStub = sinon
        .stub(awsDeploy, 'updateStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['rollback:rollback']().then(() => {
        expect(setBucketNameStub.calledOnce)
          .to.be.equal(true);
        expect(setStackToUpdateStub.calledAfter(setBucketNameStub))
          .to.be.equal(true);
        expect(updateStackStub.calledAfter(setStackToUpdateStub))
          .to.be.equal(true);
      });
    });
  });
});
