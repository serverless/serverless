'use strict';

const expect = require('chai').expect;
const Serverless = require('../../Serverless');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const testUtils = require('../../../tests/utils');
const fse = require('fs-extra');
const path = require('path');
const proxyquire = require('proxyquire');

const remove = BbPromise.promisify(fse.remove);

describe('Install', () => {
  let install;
  let serverless;
  let downloadStub;
  let Install;

  let servicePath;
  let defaultServicePath;
  let newServicePath;

  fse.mkdirsSync('tmp');
  process.chdir('tmp');

  beforeEach(() => {
    servicePath = './';
    defaultServicePath = path.join(servicePath, 'service-to-be-downloaded');
    newServicePath = path.join(servicePath, servicePath, 'new-service-name');

    downloadStub = sinon.stub().returns(BbPromise.resolve());
    Install = proxyquire('./install.js', {
      download: downloadStub,
    });
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

    it('should set new service in serverless.yml and name in package.json', () => {
      const defaultServiceYml =
        'service: service-name\n\nprovider:\n  name: aws\n';
      const newServiceYml =
        'service: new-service-name\n\nprovider:\n  name: aws\n';

      const defaultServiceName = 'service-name';
      const newServiceName = 'new-service-name';

      const tempPath = testUtils.getTmpDirPath();
      const packageFile = path.join(tempPath, 'package.json');
      const serviceFile = path.join(tempPath, 'serverless.yml');

      serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
      fse.writeFileSync(serviceFile, defaultServiceYml);

      return install.renameService(newServiceName, tempPath)
        .then(() => {
          const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
          const packageJson = serverless.utils.readFileSync(packageFile);
          expect(serviceYml).to.equal(newServiceYml);
          expect(packageJson.name).to.equal(newServiceName);
        });
    });

    it('should set new service in commented serverless.yml and name in package.json', () => {
      const defaultServiceYml =
        '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
      const newServiceYml =
        '# comment\nservice: new-service-name #comment\n\nprovider:\n  name: aws\n# comment';

      const defaultServiceName = 'service-name';
      const newServiceName = 'new-service-name';

      const tempPath = testUtils.getTmpDirPath();
      const packageFile = path.join(tempPath, 'package.json');
      const serviceFile = path.join(tempPath, 'serverless.yml');

      serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
      fse.writeFileSync(serviceFile, defaultServiceYml);

      return install.renameService(newServiceName, tempPath)
        .then(() => {
          const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
          const packageJson = serverless.utils.readFileSync(packageFile);
          expect(serviceYml).to.equal(newServiceYml);
          expect(packageJson.name).to.equal(newServiceName);
        });
    });

    it('should set new service in commented serverless.yml without existing package.json', () => {
      const defaultServiceYml =
        '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
      const newServiceYml =
        '# comment\nservice: new-service-name #comment\n\nprovider:\n  name: aws\n# comment';

      const tempPath = testUtils.getTmpDirPath();
      const serviceFile = path.join(tempPath, 'serverless.yml');

      serverless.utils.writeFileDir(serviceFile);
      fse.writeFileSync(serviceFile, defaultServiceYml);

      return install.renameService('new-service-name', tempPath)
        .then(() => {
          const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
          expect(serviceYml).to.equal(newServiceYml);
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

      fse.removeSync(defaultServicePath);
      fse.removeSync(newServicePath);
      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal(`${install.options.url}/archive/master.zip`);
      });
    });

    it('should download and rename the service based on the GitHub URL', () => {
      install.options = {
        url: 'https://github.com/johndoe/service-to-be-downloaded',
        name: 'new-service-name',
      };

      fse.removeSync(defaultServicePath);
      fse.removeSync(newServicePath);

      downloadStub.returns(new BbPromise((resolve) => {
        remove(newServicePath)
          .then(() => serverless
            .utils.writeFileSync(
              path.join(
                newServicePath,
                'serverless.yml'),
              'service: service-name'))
          .then(resolve);
      }));

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][1]).to.contain(install.options.name);
        expect(downloadStub.args[0][0]).to.equal(`${install.options.url}/archive/master.zip`);
        const yml = serverless.utils.readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(install.options.name);
      });
    });

    it('should download the service based on directories in the GitHub URL', () => {
      install.options = { url: 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb' };
      sinon.stub(serverless.utils, 'copyDirContentsSync').returns(true);
      sinon.stub(fse, 'removeSync').returns(true);

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal('https://github.com/serverless/examples/archive/master.zip');
        expect(serverless.utils.copyDirContentsSync.calledOnce).to.equal(true);
        expect(fse.removeSync.calledOnce).to.equal(true);

        serverless.utils.copyDirContentsSync.restore();
        fse.removeSync.restore();
      });
    });

    it('should throw an error if the same service name exists as directory in Github', () => {
      install.options = { url: 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb' };
      const tmpDir = testUtils.getTmpDirPath();
      const serviceDirName = path.join(tmpDir, 'rest-api-with-dynamodb');
      fse.mkdirsSync(serviceDirName);

      const cwd = process.cwd();
      process.chdir(tmpDir);

      expect(() => install.install()).to.throw(Error);
      process.chdir(cwd);
    });
  });
});
