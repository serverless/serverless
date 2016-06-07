'use strict';

const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');

const serverless = new Serverless();
serverless.init();
const awsDeploy = new AwsDeploy(serverless);

describe('AwsDeploy', () => {
  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const validateInputStub = sinon
        .stub(awsDeploy, 'validateInput').returns(BbPromise.resolve());
      const createStackStub = sinon
        .stub(awsDeploy, 'createStack').returns(BbPromise.resolve());
      const deployFunctionsStub = sinon
        .stub(awsDeploy, 'deployFunctions').returns(BbPromise.resolve());
      const updateStackStub = sinon
        .stub(awsDeploy, 'updateStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:deploy']().then(() => {
        expect(validateInputStub.calledOnce).to.be.equal(true);
        expect(createStackStub.calledAfter(validateInputStub)).to.be.equal(true);
        expect(deployFunctionsStub.calledAfter(createStackStub)).to.be.equal(true);
        expect(updateStackStub.calledAfter(deployFunctionsStub)).to.be.equal(true);

        awsDeploy.validateInput.restore();
        awsDeploy.createStack.restore();
        awsDeploy.deployFunctions.restore();
        awsDeploy.updateStack.restore();
      });
    });
  });
});
