'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');
const OpenWhiskRemove = require('../');
const Serverless = require('../../../../Serverless');

describe('OpenWhiskRemove', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const openwhiskRemove = new OpenWhiskRemove(serverless, options);
  openwhiskRemove.serverless.cli = new serverless.classes.CLI();

  describe('#constructor()', () => {
    it('should have hooks', () => expect(openwhiskRemove.hooks).to.be.not.empty);

    it('should have access to the serverless instance', () => {
      expect(openwhiskRemove.serverless).to.deep.equal(serverless);
    });

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(openwhiskRemove, 'validate').returns(BbPromise.resolve());
      sinon.stub(openwhiskRemove, 'removeFunctions').returns(BbPromise.resolve());
      sinon.stub(openwhiskRemove, 'removeTriggers').returns(BbPromise.resolve());
      sinon.stub(openwhiskRemove, 'removeRules').returns(BbPromise.resolve());

      return openwhiskRemove.hooks['remove:remove']()
        .then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);

          openwhiskRemove.validate.restore();
          openwhiskRemove.removeFunctions.restore();
          openwhiskRemove.removeTriggers.restore();
          openwhiskRemove.removeRules.restore();
        });
    });
  });
});
