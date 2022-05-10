'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const SlStats = require('../../../../lib/plugins/slstats');
const Serverless = require('../../../../lib/serverless');
const config = require('@serverless/utils/config');

describe('SlStats', () => {
  let slStats;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
    return serverless.init().then(() => {
      slStats = new SlStats(serverless);
    });
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(slStats.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(slStats.commands).to.be.not.empty);

    it('should have hooks', () => expect(slStats.hooks).to.be.not.empty);
  });

  describe('#toggleStats()', () => {
    let setStub;

    beforeEach(() => {
      setStub = sinon.stub(config, 'set');
    });

    afterEach(() => {
      config.set.restore();
    });

    it('should set config.trackingDisabled to true if disabled', () => {
      setStub.returns();
      slStats.options = { disable: true };

      slStats.toggleStats();
      expect(setStub.calledOnce).to.equal(true);
      expect(setStub.calledWithExactly('trackingDisabled', true)).to.equal(true);
    });

    it('should set config.trackingDisabled to false if enabled', () => {
      setStub.returns();
      slStats.options = { enable: true };

      slStats.toggleStats();
      expect(setStub.calledOnce).to.equal(true);
      expect(setStub.calledWithExactly('trackingDisabled', false)).to.equal(true);
    });

    it('should resolve if no "enabled" / "disabled" options is given', () => {
      setStub.returns();
      slStats.options = {};

      slStats.toggleStats();
      expect(setStub.calledOnce).to.equal(false);
    });
  });
});
