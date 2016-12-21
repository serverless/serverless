'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Config = require('./config');
const Serverless = require('../../Serverless');

describe('Config', () => {
  let config;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {};
    config = new Config(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have the command "config"', () => {
      expect(config.commands.config).to.not.equal(undefined);
    });

    it('should have the sub-command "credentials"', () => {
      expect(config.commands.config.commands.credentials).to.not.equal(undefined);
    });

    it('should have no lifecycle event', () => {
      expect(config.commands.config.lifecycleEvents).to.deep.equal(undefined);
    });

    it('should have the lifecycle event "config" for the "credentials" sub-command', () => {
      expect(config.commands.config.commands.credentials.lifecycleEvents).to.deep.equal([
        'config',
      ]);
    });

    it('should have a required option "provider" for the "credentials" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(config.commands.config.commands.credentials.options.provider.required).to.be.true;
    });

    it('should have a "before:config:credentials:config" hook', () => {
      expect(config.hooks['before:config:credentials:config']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "before:config:credentials:config" hook', () => {
      const configStub = sinon
        .stub(config, 'validate').resolves();

      return config.hooks['before:config:credentials:config']().then(() => {
        expect(configStub.calledOnce).to.equal(true);

        config.validate.restore();
      });
    });
  });

  describe('#validate()', () => {
    it('should throw an error if user passed unsupported "provider" option', () => {
      config.options.provider = 'invalid-provider';
      expect(() => config.validate()).to.throw(Error);
    });

    it('should resolve if user passed supported "provider" option', (done) => {
      config.options.provider = 'aws'; // aws is one example for a valid provider

      config.validate().then(() => done());
    });
  });
});
