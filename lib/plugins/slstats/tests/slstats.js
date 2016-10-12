'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const SlStats = require('../slstats');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

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

  describe('#toogleStats()', () => {
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

    it('should write a file in the .serverless dir if stats is disabled', () => {
      slStats.options = { disable: true };

      slStats.toggleStats();

      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-disabled'))
      ).to.equal(true);
    });

    it('should remove the file in the .serverless dir if stats is enabled', () => {
      slStats.options = { enable: true };

      slStats.toggleStats();

      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-disabled'))
      ).to.equal(false);
    });

    afterEach(() => {
      // recover the homeDir
      process.env.HOME = homeDir;
      process.env.HOMEPATH = homeDir;
      process.env.USERPROFILE = homeDir;
    });
  });
});
