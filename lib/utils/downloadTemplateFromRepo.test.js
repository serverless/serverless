'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const testUtils = require('../../tests/utils');
const fse = require('fs-extra');
const path = require('path');
const proxyquire = require('proxyquire');

const writeFileSync = require('./fs/writeFileSync');
const readFileSync = require('./fs/readFileSync');

const remove = BbPromise.promisify(fse.remove);

describe('downloadTemplateFromRepo', () => {
  let downloadTemplateFromRepo;
  let downloadStub;
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

    downloadStub = sinon.stub().resolves();

    downloadTemplateFromRepo = proxyquire('./downloadTemplateFromRepo', {
      download: downloadStub,
    }).downloadTemplateFromRepo;
  });

  afterEach(() => {
    // change back to the old cwd
    process.chdir(cwd);
  });

  describe('downloadTemplateFromRepo', () => {
    it('should throw an error if the passed URL option is not a valid URL', () => {
      expect(() => downloadTemplateFromRepo(null, 'invalidUrl')).to.throw(Error);
    });

    it('should throw an error if the passed URL is not a valid GitHub URL', () => {
      expect(() => downloadTemplateFromRepo(null, 'http://no-github-url.com/foo/bar')).to.throw(Error);
    });

    it('should throw an error if a directory with the same service name is already present', () => {
      const serviceDirName = path.join(servicePath, 'existing-service');
      fse.mkdirsSync(serviceDirName);

      expect(() => downloadTemplateFromRepo(null, 'https://github.com/johndoe/existing-service')).to.throw(Error);
    });

    it('should download the service based on the GitHub URL', () => {
      const url = 'https://github.com/johndoe/service-to-be-downloaded';

      return downloadTemplateFromRepo(null, url).then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal(`${url}/archive/master.zip`);
      });
    });

    it('should throw an error if the same service name exists as directory in Github', () => {
      const url = 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb';
      const serviceDirName = path.join(servicePath, 'rest-api-with-dynamodb');
      fse.mkdirsSync(serviceDirName);

      expect(() => downloadTemplateFromRepo(null, url)).to.throw(Error);
    });

    it('should download and rename the service based on the GitHub URL', () => {
      const url = 'https://github.com/johndoe/service-to-be-downloaded';
      const name = 'new-service-name';

      downloadStub.returns(
        remove(newServicePath)
          .then(() => {
            const sp = downloadStub.args[0][1];
            const slsYml = path.join(
              sp,
              'serverless.yml');
            writeFileSync(slsYml, 'service: service-name');
          }));

      return downloadTemplateFromRepo(name, url).then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][1]).to.contain(name);
        expect(downloadStub.args[0][0]).to.equal(`${url}/archive/master.zip`);
        const yml = readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(name);
      });
    });

    it('should download and rename the service based directories in the GitHub URL', () => {
      const url = 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb';
      const name = 'new-service-name';

      downloadStub.returns(
        remove(newServicePath)
          .then(() => {
            const sp = downloadStub.args[0][1];
            const slsYml = path.join(
              sp,
              'rest-api-with-dynamodb',
              'serverless.yml');
            writeFileSync(slsYml, 'service: service-name');
          }));

      return downloadTemplateFromRepo(name, url).then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        const yml = readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(name);
      });
    });
  });
});
