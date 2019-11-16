'use strict';

const chai = require('chai');
const Serverless = require('../../Serverless');
const Install = require('./install.js');
const sinon = require('sinon');
const download = require('../../utils/downloadTemplateFromRepo');
const userStats = require('../../utils/userStats');
const fse = require('fs-extra');
const path = require('path');
const { getTmpDirPath } = require('../../../tests/utils/fs');

chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('Install', () => {
  let install;
  let serverless;
  let cwd;
  let logSpy;

  let servicePath;

  beforeEach(() => {
    const tmpDir = getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    servicePath = tmpDir;

    sinon.stub(userStats, 'track').resolves();

    serverless = new Serverless();
    install = new Install(serverless);
    return serverless.init().then(() => {
      install.serverless.cli = new serverless.classes.CLI();
      logSpy = sinon.spy(install.serverless.cli, 'log');
    });
  });

  afterEach(() => {
    userStats.track.restore();
    // change back to the old cwd
    process.chdir(cwd);
  });

  describe('#constructor()', () => {
    let installStub;

    beforeEach(() => {
      installStub = sinon.stub(install, 'install').resolves();
    });

    afterEach(() => {
      install.install.restore();
    });

    it('should have commands', () => expect(install.commands).to.be.not.empty);

    it('should have hooks', () => expect(install.hooks).to.be.not.empty);

    it('should run promise chain in order for "install:install" hook', () =>
      install.hooks['install:install']().then(() => {
        expect(installStub.calledOnce).to.be.equal(true);
      }));
  });

  describe('#install()', () => {
    let downloadStub;

    beforeEach(() => {
      downloadStub = sinon.stub(download, 'downloadTemplateFromRepo');
    });

    afterEach(() => {
      download.downloadTemplateFromRepo.restore();
    });

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

    it('should succeed if template can be downloaded and installed', () => {
      install.options = { url: 'https://github.com/johndoe/remote-service' };
      downloadStub.resolves('remote-service');

      return install.install().then(() => {
        const installationMessage = logSpy.args.filter(arg =>
          arg[0].includes('installed "remote-service"')
        );

        expect(downloadStub).to.have.been.calledOnce; // eslint-disable-line
        expect(installationMessage[0]).to.have.lengthOf(1);
      });
    });

    it('should succeed and print out the desired service name', () => {
      install.options = { url: 'https://github.com/johndoe/remote-service' };
      install.options.name = 'remote';
      downloadStub.resolves('remote-service');

      return install.install().then(() => {
        const installationMessage = logSpy.args.filter(arg =>
          arg[0].includes('installed "remote-service" as "remote"')
        );

        expect(downloadStub).to.have.been.calledOnce; // eslint-disable-line
        expect(installationMessage[0]).to.have.lengthOf(1);
      });
    });
  });
});
