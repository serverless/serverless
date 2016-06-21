'use strict';

const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');

describe('AwsDeploy', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const awsDeploy = new AwsDeploy(serverless, options);
  awsDeploy.serverless.cli = new serverless.classes.CLI();

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);

    it('should run "before:deploy:initializeResources" hook promise chain in order', () => {
      const validateStub = sinon
        .stub(awsDeploy, 'validate').returns(BbPromise.resolve());

      return awsDeploy.hooks['before:deploy:initializeResources']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        awsDeploy.validate.restore();
      });
    });

    it('should run "deploy:initializeResources" hook promise chain in order', () => {
      const initializeResourcesStub = sinon
        .stub(awsDeploy, 'initializeResources').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:initializeResources']().then(() => {
        expect(initializeResourcesStub.calledOnce).to.be.equal(true);
        awsDeploy.initializeResources.restore();
      });
    });

    it('should run "deploy:createProviderStacks" hook promise chain in order', () => {
      const createStackStub = sinon
        .stub(awsDeploy, 'createStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:createProviderStacks']().then(() => {
        expect(createStackStub.calledOnce).to.be.equal(true);
        awsDeploy.createStack.restore();
      });
    });

    it('should run "deploy:deploy" promise chain in order', () => {
      const deployFunctionsStub = sinon
        .stub(awsDeploy, 'deployFunctions').returns(BbPromise.resolve());
      const updateStackStub = sinon
        .stub(awsDeploy, 'updateStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:deploy']().then(() => {
        expect(deployFunctionsStub.calledOnce).to.be.equal(true);
        expect(updateStackStub.calledAfter(deployFunctionsStub)).to.be.equal(true);

        awsDeploy.deployFunctions.restore();
        awsDeploy.updateStack.restore();
      });
    });
  });
});
