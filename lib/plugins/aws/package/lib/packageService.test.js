
'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Package = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#packageService()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    packageService = new Package(serverless, {});
    packageService.serverless.cli = new serverless.classes.CLI();
    packageService.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
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

  describe('#packageService()', () => {
    it('should package all functions', () => {
      serverless.service.package.individually = false;

      const packageAllStub = sinon
        .stub(packageService, 'packageAll').resolves();

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
        .stub(packageService, 'packageFunction').resolves((func) => func.name);

      return packageService.packageService().then(() => {
        expect(packageFunctionStub.calledTwice).to.be.equal(true);
      });
    });

    it('should package single function individually', () => {
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
          package: {
            individually: true,
          },
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packageService, 'packageFunction').resolves((func) => func.name);
      const packageAllStub = sinon
        .stub(packageService, 'packageAll').resolves((func) => func.name);

      return packageService.packageService().then(() => {
        expect(packageFunctionStub.calledOnce).to.be.equal(true);
        expect(packageAllStub.calledOnce).to.be.equal(true);
      });
    });
  });

  describe('#packageAll()', () => {
    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const exclude = ['test-exclude'];
      const include = ['test-include'];
      const zipFileName = packageService.provider.naming.getServiceArtifactName();
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;
      packageService.provider = packageService.serverless.getProvider('aws');

      const getExcludesStub = sinon
        .stub(packageService, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packageService, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').resolves(artifactFilePath);

      return packageService.packageAll().then(() => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        packageService.getExcludes.restore();
        packageService.getIncludes.restore();
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
      const zipFileName = 'test-func.zip';
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.functions[funcName] = { name: `test-proj-${funcName}` };

      const getExcludesStub = sinon
        .stub(packageService, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packageService, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(packageService, 'zipDirectory').resolves(artifactFilePath);

      return packageService.packageFunction(funcName).then((filePath) => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        expect(filePath).to.be.equal(artifactFilePath);

        packageService.getExcludes.restore();
        packageService.getIncludes.restore();
        packageService.zipDirectory.restore();
      });
    });
  });
});
