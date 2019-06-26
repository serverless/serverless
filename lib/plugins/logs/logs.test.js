'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Logs = require('./logs');
const Serverless = require('../../Serverless');

describe('Logs', () => {
  let logs;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    logs = new Logs(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(logs.commands).to.be.not.empty);
  });

  describe('#track()', () => {
    let userStats;

    beforeEach(() => {
      userStats = { track: sinon.spy() };
    });

    describe('Without cli processed input', () => {
      it('do not track user stats', () => {
        const newLogs = new Logs(serverless);
        newLogs.userStats = userStats;

        return newLogs.track().then(() => {
          expect(userStats.track.called).to.be.equal(false);
        });
      });
    });

    describe('With cli processed input', () => {
      it('tracks user stats with viewed option', () => {
        serverless.processedInput = { commands: [], options: {} };

        const newLogs = new Logs(serverless);
        newLogs.userStats = userStats;

        return newLogs.track().then(() => {
          expect(userStats.track.calledWithExactly('service_logsViewed')).to.be.equal(true);
        });
      });

      it('tracks user stats with tailed option', () => {
        serverless.processedInput = { commands: [], options: { tail: true } };

        const newLogs = new Logs(serverless);
        newLogs.userStats = userStats;

        return newLogs.track().then(() => {
          expect(userStats.track.calledWithExactly('service_logsTailed')).to.be.equal(true);
        });
      });
    });
  });
});
