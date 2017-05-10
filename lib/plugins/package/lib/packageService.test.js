'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const Package = require('../package');
const Serverless = require('../../../Serverless');

describe('#packageService()', () => {
  let serverless;
  let packagePlugin;

  beforeEach(() => {
    serverless = new Serverless();
    packagePlugin = new Package(serverless, {});
    packagePlugin.serverless.cli = new serverless.classes.CLI();
    packagePlugin.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
  });

  describe('#getIncludes()', () => {
    it('should return an empty array if no includes are provided', () => {
      const include = packagePlugin.getIncludes();

      expect(include).to.deep.equal([]);
    });

    it('should merge package includes', () => {
      const packageIncludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.include = packageIncludes;

      const include = packagePlugin.getIncludes();
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

      const include = packagePlugin.getIncludes(funcIncludes);
      expect(include).to.deep.equal([
        'dir', 'file.js',
        'lib', 'other.js',
      ]);
    });
  });

  describe('#getExcludes()', () => {
    it('should exclude defaults', () => {
      const exclude = packagePlugin.getExcludes();
      expect(exclude).to.deep.equal(packagePlugin.defaultExcludes);
    });

    it('should merge defaults with excludes', () => {
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = packagePlugin.getExcludes();
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

      const exclude = packagePlugin.getExcludes(funcExcludes);
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
        .stub(packagePlugin, 'packageAll').resolves();

      return packagePlugin.packageService().then(() => {
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
        .stub(packagePlugin, 'packageFunction').resolves((func) => func.name);

      return packagePlugin.packageService().then(() => {
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
        .stub(packagePlugin, 'packageFunction').resolves((func) => func.name);
      const packageAllStub = sinon
        .stub(packagePlugin, 'packageAll').resolves((func) => func.name);

      return packagePlugin.packageService().then(() => {
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
      const zipFileName = `${serverless.service.service}.zip`;
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;

      const getExcludesStub = sinon
        .stub(packagePlugin, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packagePlugin, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(packagePlugin, 'zipDirectory').resolves(artifactFilePath);

      return packagePlugin.packageAll().then(() => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        packagePlugin.getExcludes.restore();
        packagePlugin.getIncludes.restore();
        packagePlugin.zipDirectory.restore();
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
        .stub(packagePlugin, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(packagePlugin, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(packagePlugin, 'zipDirectory').resolves(artifactFilePath);

      return packagePlugin.packageFunction(funcName).then((filePath) => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        expect(filePath).to.be.equal(artifactFilePath);

        packagePlugin.getExcludes.restore();
        packagePlugin.getIncludes.restore();
        packagePlugin.zipDirectory.restore();
      });
    });
  });
});
