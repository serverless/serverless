'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const Setup = require('./setup');
const Serverless = require('../../Serverless');

describe('Setup', () => {
  let setup;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {};
    setup = new Setup(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have the command "setup"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(setup.commands.setup).to.not.be.undefined;
    });

    it('should have a lifecycle events "setup"', () => {
      expect(setup.commands.setup.lifecycleEvents).to.deep.equal([
        'setup',
      ]);
    });

    it('should have a required option "provider"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(setup.commands.setup.options.provider.required).to.be.true;
    });

    it('should have a "before:setup:setup" hook', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(setup.hooks['before:setup:setup']).to.not.be.undefined;
    });

    it('should run promise chain in order for "before:setup:setup" hook', () => {
      const setupStub = sinon
        .stub(setup, 'validate').returns(BbPromise.resolve());

      return setup.hooks['before:setup:setup']().then(() => {
        expect(setupStub.calledOnce).to.equal(true);

        setup.validate.restore();
      });
    });
  });

  describe('#validate()', () => {
    it('should throw an error if user passed unsupported "provider" option', () => {
      setup.options.provider = 'invalid-provider';
      expect(() => setup.validate()).to.throw(Error);
    });

    it('should resolve if user passed supported "provider" option', (done) => {
      setup.options.provider = 'aws'; // aws is one example for a valid provider

      setup.validate().then(() => done());
    });
  });
});
