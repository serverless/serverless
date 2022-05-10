'use strict';

const chai = require('chai');
const Serverless = require('../../../../lib/serverless');
const Install = require('../../../../lib/plugins/install.js');
const sinon = require('sinon');
const download = require('../../../../lib/utils/download-template-from-repo');
const fse = require('fs-extra');
const path = require('path');
const { getTmpDirPath } = require('../../../utils/fs');

chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('Install', () => {
  let install;
  let serverless;
  let cwd;

  let serviceDir;

  beforeEach(() => {
    const tmpDir = getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    serviceDir = tmpDir;

    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
    install = new Install(serverless);
    return serverless.init().then(() => {
      install.serverless.cli = new serverless.classes.CLI();
    });
  });

  afterEach(() => {
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

    it('should throw an error if the passed URL option is not a valid URL', async () => {
      install.options = { url: 'invalidUrl' };

      try {
        await install.install();
      } catch (e) {
        expect(e).to.be.instanceOf(Error);
      }
    });

    it('should throw an error if the passed URL is not a valid GitHub URL', async () => {
      install.options = { url: 'http://no-github-url.com/foo/bar' };

      try {
        await install.install();
      } catch (e) {
        expect(e).to.be.instanceOf(Error);
      }
    });

    it('should throw an error if a directory with the same service name is already present', async () => {
      install.options = { url: 'https://github.com/johndoe/existing-service' };

      const serviceDirName = path.join(serviceDir, 'existing-service');
      fse.mkdirsSync(serviceDirName);

      try {
        await install.install();
      } catch (e) {
        expect(e).to.be.instanceOf(Error);
      }
    });

    it('should succeed if template can be downloaded and installed', () => {
      install.options = { url: 'https://github.com/johndoe/remote-service' };
      downloadStub.resolves('remote-service');

      return install.install().then(() => {
        expect(downloadStub).to.have.been.calledOnce;
      });
    });

    it('should succeed and print out the desired service name', () => {
      install.options = { url: 'https://github.com/johndoe/remote-service' };
      install.options.name = 'remote';
      downloadStub.resolves('remote-service');

      return install.install().then(() => {
        expect(downloadStub).to.have.been.calledOnce;
      });
    });
  });
});
