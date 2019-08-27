'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const fse = require('fs-extra');
const path = require('path');
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const { getTmpDirPath } = require('../../tests/utils/fs');

const writeFileSync = require('./fs/writeFileSync');
const readFileSync = require('./fs/readFileSync');

const remove = BbPromise.promisify(fse.remove);

describe('downloadTemplateFromRepo', () => {
  let downloadTemplateFromRepo;
  let downloadStub;
  let cwd;

  let parseRepoURL;
  let fetchStub;

  let servicePath;
  let newServicePath;

  beforeEach(() => {
    const tmpDir = getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    servicePath = tmpDir;
    newServicePath = path.join(servicePath, 'new-service-name');

    fetchStub = sinon.stub().resolves({
      json: () => ({
        displayName: 'Bitbucket',
      }),
    });

    downloadStub = sinon.stub().resolves();

    const downloadTemplateFromRepoModule = proxyquire('./downloadTemplateFromRepo', {
      'node-fetch': (url) => {
        if (url.indexOf('mybitbucket.server.ltd') > -1) {
          return fetchStub();
        }

        return BbPromise.reject(Error('unknown server type'));
      },
      download: downloadStub,
    });
    downloadTemplateFromRepo = downloadTemplateFromRepoModule.downloadTemplateFromRepo;
    parseRepoURL = downloadTemplateFromRepoModule.parseRepoURL;
  });

  afterEach(() => {
    // change back to the old cwd
    process.chdir(cwd);
  });

  describe('downloadTemplateFromRepo', () => {
    it('should reject an error if the passed URL option is not a valid URL', () => {
      return downloadTemplateFromRepo('invalidUrl').catch((e) => expect(e).to.be.an.instanceOf(Error));
    });

    it('should reject an error if the passed URL is not a valid GitHub URL', () => {
      return downloadTemplateFromRepo('http://no-git-hub-url.com/foo/bar')
        .catch((e) => expect(e).to.be.an.instanceOf(Error));
    });

    it('should reject an error if a directory with the same service name is already present', () => {
      const serviceDirName = path.join(servicePath, 'existing-service');
      fse.mkdirsSync(serviceDirName);

      return downloadTemplateFromRepo('https://github.com/johndoe/existing-service')
        .catch((e) => expect(e).to.be.an.instanceOf(Error));
    });

    it('should download the service based on the GitHub URL', () => {
      const url = 'https://github.com/johndoe/service-to-be-downloaded';

      return downloadTemplateFromRepo(url).then(() => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][0]).to.equal(`${url}/archive/master.zip`);
      });
    });

    xit('should download and rename the service based on the GitHub URL', () => {
      const url = 'https://github.com/johndoe/service-to-be-downloaded';
      const name = 'new-service-name';
      
      downloadStub.returns(
        remove(newServicePath).then(() => {
          const sp = downloadStub.args[0][1];
          const slsYml = path.join(sp, 'serverless.yml');
          writeFileSync(slsYml, 'service: service-name');
        })
      );
  
      return downloadTemplateFromRepo(url, name).then(serviceName => {
        expect(downloadStub.calledOnce).to.equal(true);
        expect(downloadStub.args[0][1]).to.contain(name);
        expect(downloadStub.args[0][0]).to.equal(`${url}/archive/master.zip`);
        const yml = readFileSync(path.join(newServicePath, 'serverless.yml'));
        expect(yml.service).to.equal(name);
        expect(serviceName).to.equal('service-to-be-downloaded');
      });
    });

    xit('should download and rename the service based directories in the GitHub URL', async () => {
      const url = 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb';
      const name = 'new-service-name';
  
      downloadStub.returns(
        remove(newServicePath).then(() => {
          console.log(downloadStub.getCall(0))
          const sp = downloadStub.args[0][1];
          const slsYml = path.join(sp, 'rest-api-with-dynamodb', 'serverless.yml');
          writeFileSync(slsYml, 'service: service-name');
        })
      );
  
      const serviceName = await downloadTemplateFromRepo(url, name);
  
      expect(downloadStub.calledOnce).to.equal(true);
      const yml = readFileSync(path.join(newServicePath, 'serverless.yml'));
      expect(yml.service).to.equal(name);
      expect(serviceName).to.equal('rest-api-with-dynamodb');
    });

    it('should throw an error if the same service name exists as directory in Github', () => {
      const url = 'https://github.com/serverless/examples/tree/master/rest-api-with-dynamodb';
      const serviceDirName = path.join(servicePath, 'rest-api-with-dynamodb');
      fse.mkdirsSync(serviceDirName);

      return downloadTemplateFromRepo(null, url).catch((e) => expect(e).to.be.an.instanceOf(Error));
    });
  });

  describe('parseRepoURL', () => {
    it('should reject an error if no URL is provided', () => {
      return parseRepoURL().catch((e) => expect(e).to.be.instanceOf(Error));
    });

    it('should reject an error if URL is not valid', () => {
      return parseRepoURL('non_valid_url')
        .catch((e) => expect(e).to.be.an.instanceOf(Error));
    });

    it('should throw an error if URL is not of valid provider', () => {
      return parseRepoURL('https://kostasbariotis.com/repo/owner')
        .catch((e) => expect(e).to.be.an.instanceOf(Error));
    });

    it('should parse a valid GitHub URL', async () => {
      const output = await parseRepoURL('https://github.com/serverless/serverless');

      expect(output).to.deep.eq({
        owner: 'serverless',
        repo: 'serverless',
        branch: 'master',
        downloadUrl: 'https://github.com/serverless/serverless/archive/master.zip',
        isSubdirectory: false,
        pathToDirectory: '',
        auth: '',
      });
    });

    it('should parse a valid GitHub URL with subdirectory', () => {
      return parseRepoURL('https://github.com/serverless/serverless/tree/master/assets')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'serverless',
            repo: 'serverless',
            branch: 'master',
            downloadUrl: 'https://github.com/serverless/serverless/archive/master.zip',
            isSubdirectory: true,
            pathToDirectory: 'assets',
            auth: '',
          });
        });
    });

    it('should parse a valid GitHub Entreprise URL', () => {
      return parseRepoURL('https://github.mydomain.com/serverless/serverless')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'serverless',
            repo: 'serverless',
            branch: 'master',
            downloadUrl: 'https://github.mydomain.com/serverless/serverless/archive/master.zip',
            isSubdirectory: false,
            pathToDirectory: '',
            auth: '',
          });
        });
    });

    it('should parse a valid GitHub Entreprise with subdirectory', async () => {
      return parseRepoURL(
        'https://github.mydomain.com/serverless/serverless/tree/master/assets'
      ).then((output) => {
        expect(output).to.deep.eq({
          owner: 'serverless',
          repo: 'serverless',
          branch: 'master',
          downloadUrl: 'https://github.mydomain.com/serverless/serverless/archive/master.zip',
          isSubdirectory: true,
          pathToDirectory: 'assets',
          auth: '',
        });
      });
    });

    it('should parse a valid GitHub Entreprise URL with authentication', () => {
      return parseRepoURL('https://username:password@github.com/serverless/serverless/')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'serverless',
            repo: 'serverless',
            branch: 'master',
            downloadUrl: 'https://github.com/serverless/serverless/archive/master.zip',
            isSubdirectory: false,
            auth: 'username:password',
            pathToDirectory: '',
          });
        });
    });

    it('should parse a valid BitBucket URL', () => {
      return parseRepoURL('https://bitbucket.org/atlassian/localstack')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'atlassian',
            repo: 'localstack',
            branch: 'master',
            downloadUrl: 'https://bitbucket.org/atlassian/localstack/get/master.zip',
            isSubdirectory: false,
            pathToDirectory: '',
            auth: '',
          });
        });
    });

    it('should parse a valid BitBucket URL with subdirectory', () => {
      return parseRepoURL(
        'https://bitbucket.org/atlassian/localstack/src/85870856fd6941ae75c0fa946a51cf756ff2f53a/localstack/dashboard/?at=mvn'
      ).then((output) => {
        expect(output).to.deep.eq({
          owner: 'atlassian',
          repo: 'localstack',
          branch: 'mvn',
          downloadUrl: 'https://bitbucket.org/atlassian/localstack/get/mvn.zip',
          isSubdirectory: true,
          pathToDirectory: `localstack${path.sep}dashboard`,
          auth: '',
        });
      });
    });

    it('should parse a valid Bitbucket Server URL', () => {
      parseRepoURL(
        'https://user:pass@mybitbucket.server.ltd/rest/api/latest/projects/myproject/repos/myrepo/archive?at=refs%2Fheads%2Fdevelop'
      ).then((output) => {
        expect(output).to.deep.eq({
          owner: 'myproject',
          repo: 'myrepo',
          branch: 'refs/heads/develop',
          downloadUrl:
            'https://mybitbucket.server.ltd/rest/api/latest/projects/myproject/repos/myrepo/archive?at=refs%2Fheads%2Fdevelop&format=zip',
          isSubdirectory: false,
          pathToDirectory: '',
          auth: 'user:pass',
        });
      });
    });

    it('should parse a valid GitLab URL ', () => {
      parseRepoURL('https://gitlab.com/serverless/serverless')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'serverless',
            repo: 'serverless',
            branch: 'master',
            downloadUrl:
              'https://gitlab.com/serverless/serverless/-/archive/master/serverless-master.zip',
            isSubdirectory: false,
            pathToDirectory: '',
            auth: '',
          });
        });
    });

    it('should parse a valid GitLab URL with subdirectory', () => {
      return parseRepoURL('https://gitlab.com/serverless/serverless/tree/dev/subdir')
        .then((output) => {
          expect(output).to.deep.eq({
            owner: 'serverless',
            repo: 'serverless',
            branch: 'dev',
            downloadUrl: 'https://gitlab.com/serverless/serverless/-/archive/dev/serverless-dev.zip',
            isSubdirectory: true,
            pathToDirectory: 'subdir',
            auth: '',
          });
        });
    });
  });
});
