'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const Package = require('../package');
const Serverless = require('../../../Serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

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
        'npm-debug.log', 'serverless.yml',
        'serverless.yaml', 'serverless.json', 'serverless.js',
        '.serverless/**', '.serverless_plugins/**',
        'dir', 'file.js',
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
        'npm-debug.log', 'serverless.yml',
        'serverless.yaml', 'serverless.json', 'serverless.js',
        '.serverless/**', '.serverless_plugins/**',
        'dir', 'file.js', 'lib', 'other.js',
      ]);
    });
  });

  describe('#packageService()', () => {
    it('should package all functions', () => {
      serverless.service.package.individually = false;

      const packageAllStub = sinon
        .stub(packagePlugin, 'packageAll').resolves();

      return expect(packagePlugin.packageService()).to.be.fulfilled
      .then(() => expect(packageAllStub).to.be.calledOnce);
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

      return expect(packagePlugin.packageService()).to.be.fulfilled
      .then(() => expect(packageFunctionStub).to.be.calledTwice);
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

      return expect(packagePlugin.packageService()).to.be.fulfilled
      .then(() => BbPromise.join(
        expect(packageFunctionStub).to.be.calledOnce,
        expect(packageAllStub).to.be.calledOnce
      ));
    });

    it('should not package functions if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';

      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves();

      return expect(packagePlugin.packageService()).to.be.fulfilled
        .then(() => expect(packageAllStub).to.not.be.called);
    });

    it('should package functions individually if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';
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
      const packageAllStub = sinon
        .stub(packagePlugin, 'packageAll').resolves((func) => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled
      .then(() => BbPromise.join(
        expect(packageFunctionStub).to.be.calledTwice,
        expect(packageAllStub).to.not.be.called
      ));
    });

    it('should package single functions individually if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';
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

      return expect(packagePlugin.packageService()).to.be.fulfilled
        .then(() => BbPromise.join(
          expect(packageFunctionStub).to.be.calledOnce,
          expect(packageAllStub).to.not.be.called
        ));
    });
  });

  describe('#packageAll()', () => {
    const exclude = ['test-exclude'];
    const include = ['test-include'];
    const files = [];
    const artifactFilePath = '/some/fake/path/test-artifact.zip';
    let getExcludesStub;
    let getIncludesStub;
    let resolveFilePathsFromPatternsStub;
    let zipFilesStub;

    beforeEach(() => {
      getExcludesStub = sinon
        .stub(packagePlugin, 'getExcludes').returns(exclude);
      getIncludesStub = sinon
        .stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns').returns(files);
      zipFilesStub = sinon
        .stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
    });

    afterEach(() => {
      packagePlugin.getExcludes.restore();
      packagePlugin.getIncludes.restore();
      packagePlugin.resolveFilePathsFromPatterns.restore();
      packagePlugin.zipFiles.restore();
    });

    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const zipFileName = `${serverless.service.service}.zip`;

      serverless.config.servicePath = servicePath;

      return expect(packagePlugin.packageService()).to.be.fulfilled
      .then(() => BbPromise.all([
        expect(getExcludesStub).to.be.calledOnce,
        expect(getIncludesStub).to.be.calledOnce,
        expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
        expect(zipFilesStub).to.be.calledOnce,
        expect(zipFilesStub).to.have.been.calledWithExactly(
          files,
          zipFileName
        ),
      ]));
    });
  });

  describe('#packageFunction()', () => {
    const exclude = ['test-exclude'];
    const include = ['test-include'];
    const files = [];
    const artifactFilePath = '/some/fake/path/test-artifact.zip';
    let getExcludesStub;
    let getIncludesStub;
    let resolveFilePathsFromPatternsStub;
    let zipFilesStub;

    beforeEach(() => {
      getExcludesStub = sinon
        .stub(packagePlugin, 'getExcludes').returns(exclude);
      getIncludesStub = sinon
        .stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns').returns(files);
      zipFilesStub = sinon
        .stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
    });

    afterEach(() => {
      packagePlugin.getExcludes.restore();
      packagePlugin.getIncludes.restore();
      packagePlugin.resolveFilePathsFromPatterns.restore();
      packagePlugin.zipFiles.restore();
    });

    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const funcName = 'test-func';

      const zipFileName = 'test-func.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.functions[funcName] = { name: `test-proj-${funcName}` };

      return expect(packagePlugin.packageFunction(funcName)).to.eventually.equal(artifactFilePath)
      .then(() => BbPromise.all([
        expect(getExcludesStub).to.be.calledOnce,
        expect(getIncludesStub).to.be.calledOnce,
        expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,

        expect(zipFilesStub).to.be.calledOnce,
        expect(zipFilesStub).to.have.been.calledWithExactly(
          files,
          zipFileName
        ),
      ]));
    });

    it('should return function artifact file path', () => {
      const servicePath = 'test';
      const funcName = 'test-func';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.functions[funcName] = {
        name: `test-proj-${funcName}`,
        package: {
          artifact: 'artifact.zip',
        },
      };

      return expect(packagePlugin.packageFunction(funcName)).to.eventually
        .equal(path.join('test/artifact.zip'))
        .then(() => BbPromise.all([
          expect(getExcludesStub).to.not.have.been.called,
          expect(getIncludesStub).to.not.have.been.called,
          expect(zipFilesStub).to.not.have.been.called,
        ]));
    });

    it('should return service artifact file path', () => {
      const servicePath = 'test';
      const funcName = 'test-func';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.package = {
        artifact: 'artifact.zip',
      };
      serverless.service.functions[funcName] = {
        name: `test-proj-${funcName}`,
      };

      return expect(packagePlugin.packageFunction(funcName)).to.eventually
        .equal(path.join('test/artifact.zip'))
        .then(() => BbPromise.all([
          expect(getExcludesStub).to.not.have.been.called,
          expect(getIncludesStub).to.not.have.been.called,
          expect(zipFilesStub).to.not.have.been.called,
        ]));
    });
  });
});
