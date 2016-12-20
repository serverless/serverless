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
  let cwd;

  let servicePath;
  let newServicePath;

  beforeEach(() => {
    const tmpDir = testUtils.getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    servicePath = tmpDir;
    newServicePath = path.join(servicePath, 'new-service-name');

    downloadStub = sinon.stub().returns(BbPromise.resolve());
    Install = proxyquire('./install.js', {
      download: downloadStub,
    });
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

      const packageFile = path.join(servicePath, 'package.json');
      const serviceFile = path.join(servicePath, 'serverless.yml');

      serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
      fse.writeFileSync(serviceFile, defaultServiceYml);

      install.renameService(newServiceName, servicePath);
      const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
      const packageJson = serverless.utils.readFileSync(packageFile);
      expect(serviceYml).to.equal(newServiceYml);
      expect(packageJson.name).to.equal(newServiceName);
    });

    it('should set new service in commented serverless.yml and name in package.json', () => {
      const defaultServiceYml =
        '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
      const newServiceYml =
        '# comment\nservice: new-service-name #comment\n\nprovider:\n  name: aws\n# comment';

      const defaultServiceName = 'service-name';
      const newServiceName = 'new-service-name';

      const packageFile = path.join(servicePath, 'package.json');
      const serviceFile = path.join(servicePath, 'serverless.yml');

      serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
      fse.writeFileSync(serviceFile, defaultServiceYml);

      install.renameService(newServiceName, servicePath);
      const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
      const packageJson = serverless.utils.readFileSync(packageFile);
      expect(serviceYml).to.equal(newServiceYml);
      expect(packageJson.name).to.equal(newServiceName);
    });

    it('should set new service in commented serverless.yml without existing package.json', () => {
      const defaultServiceYml =
        '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
      const newServiceYml =
        '# comment\nservice: new-service-name #comment\n\nprovider:\n  name: aws\n# comment';

      const serviceFile = path.join(servicePath, 'serverless.yml');

      serverless.utils.writeFileDir(serviceFile);
      fse.writeFileSync(serviceFile, defaultServiceYml);

      install.renameService('new-service-name', servicePath);
      const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
      expect(serviceYml).to.equal(newServiceYml);
    });

    it('should fail to set new service name in serverless.yml', () => {
      const defaultServiceYml =
        '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';

      const serviceFile = path.join(servicePath, 'serverledss.yml');

      serverless.utils.writeFileDir(serviceFile);
      fse.writeFileSync(serviceFile, defaultServiceYml);

      expect(() => install.renameService('new-service-name', servicePath)).to.throw(Error);
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

    it('should download the service based on the GitHub URL', () => {
      install.options = { url: 'https://github.com/johndoe/service-to-be-downloaded' };

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal(`${install.options.url}/archive/master.zip`);
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
      const serviceDirName = path.join(servicePath, 'rest-api-with-dynamodb');
      fse.mkdirsSync(serviceDirName);

      expect(() => install.install()).to.throw(Error);
    });

    it('should download and rename the service based on the GitHub URL', () => {
      install.options = {
        url: 'https://github.com/johndoe/service-to-be-downloaded',
        name: 'new-service-name',
      };

      downloadStub.returns(
        remove(newServicePath)
          .then(() => {
            const sp = downloadStub.args[0][1];
            const slsYml = path.join(
              sp,
              'serverless.yml');
            serverless
              .utils.writeFileSync(slsYml, 'service: service-name');
          }));

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][1]).to.contain(install.options.name);
        expect(downloadStub.args[0][0]).to.equal(`${install.options.url}/archive/master.zip`);
        const yml = serverless.utils.readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(install.options.name);
      });
    });

    it('should download and rename the service based directories in the GitHub URL', () => {
      install.options = {
        url: 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb',
        name: 'new-service-name',
      };

      downloadStub.returns(
        remove(newServicePath)
          .then(() => {
            const sp = downloadStub.args[0][1];
            const slsYml = path.join(
              sp,
              'rest-api-with-dynamodb',
              'serverless.yml');
            serverless
              .utils.writeFileSync(slsYml, 'service: service-name');
          }));

      return install.install().then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        const yml = serverless.utils.readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(install.options.name);
      });
    });
  });
});
