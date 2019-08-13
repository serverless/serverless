'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const SlStats = require('./slstats');
const Serverless = require('../../Serverless');
const config = require('../../utils/config');
const userStats = require('../../utils/userStats');

describe('SlStats', () => {
  let slStats;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
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
    let trackStub;

    beforeEach(() => {
      setStub = sinon.stub(config, 'set');
      trackStub = sinon.stub(userStats, 'track');
    });

    afterEach(() => {
      config.set.restore();
      userStats.track.restore();
    });

    it('should set config.trackingDisabled to true if disabled', () => {
      setStub.returns();
      trackStub.resolves();
      slStats.options = { disable: true };

      return slStats.toggleStats().then(() => {
        expect(trackStub.calledOnce).to.equal(true);
        expect(trackStub.calledWithExactly('user_disabledTracking', { force: true })).to.equal(
          true
        );

        expect(setStub.calledOnce).to.equal(true);
        expect(setStub.calledWithExactly('trackingDisabled', true)).to.equal(true);
      });
    });

    it('should set config.trackingDisabled to false if enabled', () => {
      setStub.returns();
      trackStub.resolves();
      slStats.options = { enable: true };

      return slStats.toggleStats().then(() => {
        expect(trackStub.calledOnce).to.equal(true);
        expect(trackStub.calledWithExactly('user_enabledTracking', { force: true })).to.equal(true);

        expect(setStub.calledOnce).to.equal(true);
        expect(setStub.calledWithExactly('trackingDisabled', false)).to.equal(true);
      });
    });

    it('should resolve if no "enabled" / "disabled" options is given', () => {
      setStub.returns();
      trackStub.resolves();
      slStats.options = {};

      return slStats.toggleStats().then(() => {
        expect(trackStub.calledOnce).to.equal(false);
        expect(setStub.calledOnce).to.equal(false);
      });
    });

    it('should catch the error if enabling fails', () => {
      // here we assume that the tracking fails
      setStub.returns();
      trackStub.rejects('error while tracking');
      slStats.options = { enable: true };

      return slStats.toggleStats().catch(error => {
        expect(trackStub.calledOnce).to.equal(true);
        expect(setStub.calledOnce).to.equal(false);
        expect(error).to.match(/of statistics failed/);
      });
    });

    it('should catch the error if enabling fails', () => {
      // here we assume that the config setting fails
      setStub.throws('error while updating config file');
      trackStub.resolves();
      slStats.options = { disable: true };

      return slStats.toggleStats().catch(error => {
        expect(trackStub.calledOnce).to.equal(true);
        expect(setStub.calledOnce).to.equal(true);
        expect(error).to.match(/of statistics failed/);
      });
    });
  });
});
