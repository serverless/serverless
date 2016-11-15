
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

  describe('#getIncludes()', () => {
    it('should return an empty array if no includes are provided', () => {
      const include = packageService.getIncludes();

      expect(include).to.deep.equal([]);
    });

    it('should merge package includes', () => {
      const packageIncludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.include = packageIncludes;

      const include = packageService.getIncludes();
      expect(include).to.deep.equal([
        'dir', 'file.js',
      ]);
    });

    it('should merge package and func includes', () => {
      const funcIncludes = [
        'lib', 'other.js',
      ];
      const packageIncludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.include = packageIncludes;

      const include = packageService.getIncludes(funcIncludes);
      expect(include).to.deep.equal([
        'dir', 'file.js',
        'lib', 'other.js',
      ]);
    });
  });

  describe('#getExcludes()', () => {
    it('should exclude defaults', () => {
      const exclude = packageService.getExcludes();
      expect(exclude).to.deep.equal(packageService.defaultExcludes);
    });

    it('should merge defaults with excludes', () => {
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = packageService.getExcludes();
      expect(exclude).to.deep.equal([
        '.git/**', '.gitignore', '.DS_Store',
        'npm-debug.log',
        'serverless.yaml', 'serverless.yml',
        '.serverless/**', 'dir', 'file.js',
      ]);
    });

    it('should merge defaults with package and func excludes', () => {
      const funcExcludes = [
        'lib', 'other.js',
      ];
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = packageService.getExcludes(funcExcludes);
      expect(exclude).to.deep.equal([
        '.git/**', '.gitignore', '.DS_Store',
        'npm-debug.log',
        'serverless.yaml', 'serverless.yml',
        '.serverless/**', 'dir', 'file.js',
        'lib', 'other.js',
      ]);
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

    it('should package all functions', () => {
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

      const getExcludesStub = sinon
        .stub(packageService, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packageService, 'getIncludes').returns(include);
      const getServiceArtifactNameStub = sinon
        .stub(packageService, 'getServiceArtifactName').returns(artifactName);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').returns(BbPromise.resolve(artifactFilePath));

      return packageService.packageAll().then(() => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);
        expect(getServiceArtifactNameStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          servicePath,
          exclude,
          include,
          artifactName
        )).to.be.equal(true);
        expect(serverless.service.package.artifact).to.be.equal(artifactFilePath);

        packageService.getExcludes.restore();
        packageService.getIncludes.restore();
        packageService.getServiceArtifactName.restore();
        packageService.zipDirectory.restore();
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

      const getExcludesStub = sinon
        .stub(packageService, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packageService, 'getIncludes').returns(include);
      const getFunctionArtifactNameStub = sinon
        .stub(packageService, 'getFunctionArtifactName').returns(artifactName);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').returns(BbPromise.resolve(artifactFilePath));

      return packageService.packageFunction(funcName).then((filePath) => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);
        expect(getFunctionArtifactNameStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          servicePath,
          exclude,
          include,
          artifactName
        )).to.be.equal(true);

        expect(filePath).to.be.equal(artifactFilePath);

        packageService.getExcludes.restore();
        packageService.getIncludes.restore();
        packageService.getFunctionArtifactName.restore();
        packageService.zipDirectory.restore();
      });
    });
  });
});
