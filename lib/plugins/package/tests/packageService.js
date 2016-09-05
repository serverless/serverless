
'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');

describe('#packageService()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless();
    packageService = new Package(serverless);
    packageService.serverless.cli = new serverless.classes.CLI();
  });

  describe('#getExcludedPaths()', () => {
    it('should exclude defaults', () => {
      const exclude = packageService.getExcludedPaths();
      expect(exclude).to.deep.equal(packageService.defaultExcludes);
    });

    it('should merge defaults with excludes', () => {
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = packageService.getExcludedPaths();
      expect(exclude).to.deep.equal([
        'dir', 'file.js',
        '.git', '.gitignore', '.DS_Store',
        'npm-debug.log',
        'serverless.yaml', 'serverless.yml',
        '.serverless',
      ]);
    });

    it('should merge defaults with package and func excludes', () => {
      const funcExclude = [
        'lib', 'other.js',
      ];
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = packageService.getExcludedPaths(funcExclude);
      expect(exclude).to.deep.equal([
        'lib', 'other.js',
        'dir', 'file.js',
        '.git', '.gitignore', '.DS_Store',
        'npm-debug.log',
        'serverless.yaml', 'serverless.yml',
        '.serverless',
      ]);
    });
  });

  describe('#getIncludedPaths()', () => {
    it('should include defaults', () => {
      const include = packageService.getIncludedPaths();
      expect(include).to.deep.equal([]);
    });

    it('should return package includes', () => {
      const packageIncludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.include = packageIncludes;

      const exclude = packageService.getIncludedPaths();
      expect(exclude).to.deep.equal(packageIncludes);
    });
  });

  describe('#getServiceArtifactName()', () => {
    it('should create name with time', () => {
      const name = packageService.getServiceArtifactName();
      expect(name).to.equal(`${serverless.service.service}.zip`);
    });
  });

  describe('#getFunctionArtifactName()', () => {
    it('should create name with time', () => {
      const func = {
        name: 'test-proj-func-a',
      };

      const name = packageService.getFunctionArtifactName(func);

      expect(name).to.equal(`${func.name}.zip`);
    });
  });

  describe('#packageService()', () => {
    it('should resolve if the user has specified his own artifact', () => {
      const artifactFilePath = 'artifact.zip';
      serverless.service.package.artifact = artifactFilePath;

      const packageAllStub = sinon
        .stub(packageService, 'packageAll').returns(BbPromise.resolve());

      return packageService.packageService().then(() => {
        expect(packageAllStub.called).to.be.equal(false);
        // ensure it's not changed
        expect(serverless.service.package.artifact).to.equal(artifactFilePath);
      });
    });

    it('should package functions all', () => {
      serverless.service.package.individually = false;

      const packageAllStub = sinon
        .stub(packageService, 'packageAll').returns(BbPromise.resolve());

      return packageService.packageService().then(() => {
        expect(packageAllStub.calledOnce).to.be.equal(true);
      });
    });

    it('should package functions individually', () => {
      serverless.service.package.individually = true;
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packageService, 'packageFunction').returns((func) => BbPromise.resolve(func.name));

      return packageService.packageService().then(() => {
        expect(packageFunctionStub.calledTwice).to.be.equal(true);
      });
    });
  });

  describe('#packageAll()', () => {
    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const exclude = ['test-exclude'];
      const include = ['test-include'];
      const artifactName = 'test-artifact.zip';
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;

      const getExcludedPathsStub = sinon
        .stub(packageService, 'getExcludedPaths').returns(exclude);
      const getIncludedPathsStub = sinon
        .stub(packageService, 'getIncludedPaths').returns(include);
      const getServiceArtifactNameStub = sinon
        .stub(packageService, 'getServiceArtifactName').returns(artifactName);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').returns(BbPromise.resolve(artifactFilePath));

      return packageService.packageAll().then(() => {
        expect(getExcludedPathsStub.calledOnce).to.be.equal(true);
        expect(getIncludedPathsStub.calledOnce).to.be.equal(true);
        expect(getServiceArtifactNameStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.args[0][0]).to.be.equal(servicePath);
        expect(zipDirectoryStub.args[0][1]).to.be.equal(exclude);
        expect(zipDirectoryStub.args[0][2]).to.be.equal(include);
        expect(zipDirectoryStub.args[0][3]).to.be.equal(artifactName);

        expect(serverless.service.package.artifact).to.be.equal(artifactFilePath);
      });
    });
  });

  describe('#packageFunction()', () => {
    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const funcName = 'test-func';

      const exclude = ['test-exclude'];
      const include = ['test-include'];
      const artifactName = 'test-artifact.zip';
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.functions[funcName] = { name: `test-proj-${funcName}` };

      const getExcludedPathsStub = sinon
        .stub(packageService, 'getExcludedPaths').returns(exclude);
      const getIncludedPathsStub = sinon
        .stub(packageService, 'getIncludedPaths').returns(include);
      const getFunctionArtifactNameStub = sinon
        .stub(packageService, 'getFunctionArtifactName').returns(artifactName);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').returns(BbPromise.resolve(artifactFilePath));

      return packageService.packageFunction(funcName).then((filePath) => {
        expect(getExcludedPathsStub.calledOnce).to.be.equal(true);
        expect(getIncludedPathsStub.calledOnce).to.be.equal(true);
        expect(getFunctionArtifactNameStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.args[0][0]).to.be.equal(servicePath);
        expect(zipDirectoryStub.args[0][1]).to.be.equal(exclude);
        expect(zipDirectoryStub.args[0][2]).to.be.equal(include);
        expect(zipDirectoryStub.args[0][3]).to.be.equal(artifactName);

        expect(filePath).to.be.equal(artifactFilePath);
      });
    });
  });
});
