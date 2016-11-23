'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const AwsSetup = require('./awsSetup');
const Serverless = require('../../../Serverless');

describe('AwsSetup', () => {
  let awsSetup;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {};
    awsSetup = new AwsSetup(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have the command "setup"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup).to.not.be.undefined;
    });

    it('should have a lifecycle events "setup"', () => {
      expect(awsSetup.commands.setup.lifecycleEvents).to.deep.equal([
        'setup',
      ]);
    });

    it('should have the required options "key" and "secret"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup.options.key.required).to.be.true;
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup.options.secret.required).to.be.true;
    });

    it('should have a "setup:setup" hook', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.hooks['setup:setup']).to.not.be.undefined;
    });

    it('should run promise chain in order for "setup:setup" hook', () => {
      const awsSetupStub = sinon
        .stub(awsSetup, 'setupAws').returns(BbPromise.resolve());

      return awsSetup.hooks['setup:setup']().then(() => {
        expect(awsSetupStub.calledOnce).to.equal(true);

        awsSetup.setupAws.restore();
      });
    });
  });
});
