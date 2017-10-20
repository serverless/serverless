'use strict';

const expect = require('chai').expect;
const Serverless = require('../../Serverless');
const Install = require('./install.js');
const sinon = require('sinon');
const testUtils = require('../../../tests/utils');
const fse = require('fs-extra');
const path = require('path');

describe('Install', () => {
  let install;
  let serverless;
  let cwd;

  let servicePath;

  beforeEach(() => {
    const tmpDir = testUtils.getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    servicePath = tmpDir;

    serverless = new Serverless();
    install = new Install(serverless);
    serverless.init();
  });

  afterEach(() => {
    // change back to the old cwd
    process.chdir(cwd);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(install.commands).to.be.not.empty);

    it('should have hooks', () => expect(install.hooks).to.be.not.empty);

    it('should run promise chain in order for "install:install" hook', () => {
      const installStub = sinon
        .stub(install, 'install').resolves();

      return install.hooks['install:install']().then(() => {
        expect(installStub.calledOnce).to.be.equal(true);

        install.install.restore();
      });
    });
  });

  describe('#install()', () => {
    it('should throw an error if the passed URL option is not a valid URL', () => {
      install.options = { url: 'invalidUrl' };

      expect(() => install.install()).to.throw(Error);
    });

    it('should throw an error if the passed URL is not a valid GitHub URL', () => {
      install.options = { url: 'http://no-github-url.com/foo/bar' };

      expect(() => install.install()).to.throw(Error);
    });

    it('should throw an error if a directory with the same service name is already present', () => {
      install.options = { url: 'https://github.com/johndoe/existing-service' };

      const serviceDirName = path.join(servicePath, 'existing-service');
      fse.mkdirsSync(serviceDirName);

      expect(() => install.install()).to.throw(Error);
    });
  });
});
