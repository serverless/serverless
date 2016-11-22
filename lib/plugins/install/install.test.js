'use strict';

const expect = require('chai').expect;
const Serverless = require('../../Serverless');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const testUtils = require('../../../tests/utils');
const fse = require('fs-extra');
const path = require('path');
const proxyquire = require('proxyquire');

const downloadStub = sinon.stub().returns(BbPromise.resolve());
const Install = proxyquire('./install.js', {
  download: downloadStub,
});

describe('Install', () => {
  let install;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    install = new Install(serverless);
    serverless.init();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(install.commands).to.be.not.empty);

    it('should have hooks', () => expect(install.hooks).to.be.not.empty);

    it('should run promise chain in order for "install:install" hook', () => {
      const installStub = sinon
        .stub(install, 'install').returns(BbPromise.resolve());

      return install.hooks['install:install']().then(() => {
        expect(installStub.calledOnce).to.be.equal(true);

        install.install.restore();
      });
    });
  });

  describe('#install()', () => {
    it('shold throw an error if the passed URL option is not a valid URL', () => {
      install.options = { url: 'invalidUrl' };

      expect(() => install.install()).to.throw(Error);
    });

    it('should throw an error if the passed URL is not a valid GitHub URL', () => {
      install.options = { url: 'http://no-github-url.com/foo/bar' };

      expect(() => install.install()).to.throw(Error);
    });

    it('should throw an error if a directory with the same service name is already present', () => {
      install.options = { url: 'https://github.com/johndoe/existing-service' };

      const tmpDir = testUtils.getTmpDirPath();
      const serviceDirName = path.join(tmpDir, 'existing-service');
      fse.mkdirsSync(serviceDirName);

      const cwd = process.cwd();
      process.chdir(tmpDir);

      expect(() => install.install()).to.throw(Error);

      process.chdir(cwd);
    });

    it('should download the service based on the GitHub URL', () => {
      install.options = { url: 'https://github.com/johndoe/service-to-be-downloaded' };

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal(`${install.options.url}/archive/master.zip`);
      });
    });
  });
});
