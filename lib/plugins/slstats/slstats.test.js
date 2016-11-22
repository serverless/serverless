'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const os = require('os');
const SlStats = require('./slstats');
const Serverless = require('../../Serverless');
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

    it('should rename the stats file to stats-disabled if disabled', () => {
      // create a stats-enabled file
      serverless.utils.writeFileSync(
        path.join(serverlessDirPath, 'stats-enabled'),
        'some content'
      );

      slStats.options = { disable: true };

      slStats.toggleStats();

      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-disabled'))
      ).to.equal(true);
      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-enabled'))
      ).to.equal(false);
    });

    it('should rename the stats file to stats-enabled if enabled', () => {
      // create a stats-disabled file
      serverless.utils.writeFileSync(
        path.join(serverlessDirPath, 'stats-disabled'),
        'some content'
      );

      slStats.options = { enable: true };

      slStats.toggleStats();

      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-enabled'))
      ).to.equal(true);
      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-disabled'))
      ).to.equal(false);
    });

    it('should throw an error if the stats file does not exist', () => {
      slStats.options = { enable: true };

      expect(() => slStats.toggleStats()).to.throw(Error,
      /Enabling \/ Disabling of statistics failed: ENOENT: no such file or directory, lstat/);
      expect(
        serverless.utils.fileExistsSync(path.join(serverlessDirPath, 'stats-enabled'))
      ).to.equal(false);
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
