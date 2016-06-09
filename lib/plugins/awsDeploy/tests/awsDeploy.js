'use strict';

const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');

describe('AwsDeploy', () => {
  const serverless = new Serverless();
  serverless.init();
  const awsDeploy = new AwsDeploy(serverless);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);

    it('should run "before:deploy:initializeResources" hook promise chain in order', () => {
      const validateInputStub = sinon
        .stub(awsDeploy, 'validateInput').returns(BbPromise.resolve());

      awsDeploy.hooks['before:deploy:initializeResources']();

      expect(validateInputStub.calledOnce).to.be.equal(true);
      awsDeploy.validateInput.restore();
    });

    it('should run "deploy:initializeResources" hook promise chain in order', () => {
      const initializeResourcesStub = sinon
        .stub(awsDeploy, 'initializeResources').returns(BbPromise.resolve());

      awsDeploy.hooks['deploy:initializeResources']();

      expect(initializeResourcesStub.calledOnce).to.be.equal(true);
      awsDeploy.initializeResources.restore();
    });

    it('should run "deploy:createProviderStacks" hook promise chain in order', () => {
      const createStackStub = sinon
        .stub(awsDeploy, 'createStack').returns(BbPromise.resolve());

      awsDeploy.hooks['deploy:createProviderStacks']();

      expect(createStackStub.calledOnce).to.be.equal(true);
      awsDeploy.createStack.restore();
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
