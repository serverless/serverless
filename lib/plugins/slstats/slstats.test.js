'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const sinon = require('sinon');
const SlStats = require('./slstats');
const Serverless = require('../../Serverless');
const configUtils = require('../../utils/config');
const testUtils = require('../../../tests/utils');

describe('SlStats', () => {
  let slStats;
  let serverless;
  let homeDir;
  let serverlessDirPath;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    slStats = new SlStats(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(slStats.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(slStats.commands).to.be.not.empty);

    it('should have hooks', () => expect(slStats.hooks).to.be.not.empty);
  });

  describe('#toggleStats()', () => {
    beforeEach(() => {
      const tmpDirPath = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDirPath);

      // save the homeDir so that we can reset this later on
      homeDir = os.homedir();
      process.env.HOME = tmpDirPath;
      process.env.HOMEPATH = tmpDirPath;
      process.env.USERPROFILE = tmpDirPath;

      serverlessDirPath = path.join(os.homedir(), '.serverless');
    });
    // TODO @David need to fix these as async tests
    it('should set config.trackingDisabled to true if disabled', () => {
      slStats.options = { disable: true };
      slStats.toggleStats();

      const config = configUtils.getConfig();
      expect(config.trackingDisabled).to.equal(true);
    });
    // TODO @David need to fix these as async tests
    it('should set config.trackingDisabled to false if enabled', () => {
      // create a stats-disabled file
      slStats.options = { enable: true };
      slStats.toggleStats();

      const config = configUtils.getConfig();
      expect(config.trackingDisabled).to.equal(false);
    });

    afterEach(() => {
      // recover the homeDir
      process.env.HOME = homeDir;
      process.env.HOMEPATH = homeDir;
      process.env.USERPROFILE = homeDir;
    });
  });
});
