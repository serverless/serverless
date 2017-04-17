'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#packageService()', () => {
  let serverless;
  let awsPackage;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    awsPackage.serverless.cli = new serverless.classes.CLI();
    awsPackage.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
  });

  describe('#getIncludes()', () => {
    it('should return an empty array if no includes are provided', () => {
      const include = awsPackage.getIncludes();

      expect(include).to.deep.equal([]);
    });

    it('should merge package includes', () => {
      const packageIncludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.include = packageIncludes;

      const include = awsPackage.getIncludes();
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

      const include = awsPackage.getIncludes(funcIncludes);
      expect(include).to.deep.equal([
        'dir', 'file.js',
        'lib', 'other.js',
      ]);
    });
  });

  describe('#getExcludes()', () => {
    it('should exclude defaults', () => {
      const exclude = awsPackage.getExcludes();
      expect(exclude).to.deep.equal(awsPackage.defaultExcludes);
    });

    it('should merge defaults with excludes', () => {
      const packageExcludes = [
        'dir', 'file.js',
      ];

      serverless.service.package.exclude = packageExcludes;

      const exclude = awsPackage.getExcludes();
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

      const exclude = awsPackage.getExcludes(funcExcludes);
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
        .stub(awsPackage, 'packageAll').resolves();

      return awsPackage.packageService().then(() => {
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
        .stub(awsPackage, 'packageFunction').resolves((func) => func.name);

      return awsPackage.packageService().then(() => {
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
        .stub(awsPackage, 'packageFunction').resolves((func) => func.name);
      const packageAllStub = sinon
        .stub(awsPackage, 'packageAll').resolves((func) => func.name);

      return awsPackage.packageService().then(() => {
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
      const zipFileName = awsPackage.provider.naming.getServiceArtifactName();
      const artifactFilePath = '/some/fake/path/test-artifact.zip';

      serverless.config.servicePath = servicePath;
      awsPackage.provider = awsPackage.serverless.getProvider('aws');

      const getExcludesStub = sinon
        .stub(awsPackage, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(awsPackage, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(awsPackage, 'zipDirectory').resolves(artifactFilePath);

      return awsPackage.packageAll().then(() => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        awsPackage.getExcludes.restore();
        awsPackage.getIncludes.restore();
        awsPackage.zipDirectory.restore();
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
        .stub(awsPackage, 'getExcludes').returns(exclude);
      const getIncludesStub = sinon
        .stub(awsPackage, 'getIncludes').returns(include);

      const zipDirectoryStub = sinon
        .stub(awsPackage, 'zipDirectory').resolves(artifactFilePath);

      return awsPackage.packageFunction(funcName).then((filePath) => {
        expect(getExcludesStub.calledOnce).to.be.equal(true);
        expect(getIncludesStub.calledOnce).to.be.equal(true);

        expect(zipDirectoryStub.calledOnce).to.be.equal(true);
        expect(zipDirectoryStub.calledWithExactly(
          exclude,
          include,
          zipFileName
        )).to.be.equal(true);

        expect(filePath).to.be.equal(artifactFilePath);

        awsPackage.getExcludes.restore();
        awsPackage.getIncludes.restore();
        awsPackage.zipDirectory.restore();
      });
    });
  });
});
