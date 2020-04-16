'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const chai = require('chai');
const sinon = require('sinon');
const Package = require('../package');
const Serverless = require('../../../Serverless');
const serverlessConfigFileUtils = require('../../../../lib/utils/getServerlessConfigFile');
const { createTmpDir } = require('../../../../tests/utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('#packageService()', () => {
  let serverless;
  let packagePlugin;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.processedInput = { options: {} };
    packagePlugin = new Package(serverless, {});
    packagePlugin.serverless.cli = new serverless.classes.CLI();
    packagePlugin.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
    packagePlugin.serverless.service.provider = { runtime: 'nodejs:8.10' };
  });

  describe('#getIncludes()', () => {
    it('should return an empty array if no includes are provided', () => {
      const include = packagePlugin.getIncludes();

      expect(include).to.deep.equal([]);
    });

    it('should merge package includes', () => {
      const packageIncludes = ['dir', 'file.js'];

      serverless.service.package.include = packageIncludes;

      const include = packagePlugin.getIncludes();
      expect(include).to.deep.equal(['dir', 'file.js']);
    });

    it('should merge package and func includes', () => {
      const funcIncludes = ['lib', 'other.js'];
      const packageIncludes = ['dir', 'file.js'];

      serverless.service.package.include = packageIncludes;

      const include = packagePlugin.getIncludes(funcIncludes);
      expect(include).to.deep.equal(['dir', 'file.js', 'lib', 'other.js']);
    });
  });

  describe('#getExcludes()', () => {
    const serverlessConfigFileName = 'serverless.xyz';
    let getServerlessConfigFilePathStub;

    beforeEach(() => {
      getServerlessConfigFilePathStub = sinon
        .stub(serverlessConfigFileUtils, 'getServerlessConfigFilePath')
        .returns(BbPromise.resolve(`/path/to/${serverlessConfigFileName}`));
    });

    afterEach(() => {
      serverlessConfigFileUtils.getServerlessConfigFilePath.restore();
    });

    it('should exclude defaults and serverless config file being used', () =>
      expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        BbPromise.join(
          expect(getServerlessConfigFilePathStub).to.be.calledOnce,
          expect(exclude).to.deep.equal(
            _.union(packagePlugin.defaultExcludes, [serverlessConfigFileName])
          )
        )
      ));

    it('should exclude plugins localPath defaults', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(
          _.union(packagePlugin.defaultExcludes, [serverlessConfigFileName], [localPath])
        )
      );
    });

    it('should not exclude plugins localPath if it is empty', () => {
      const localPath = '';
      serverless.service.plugins = { localPath };

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(
          _.union(packagePlugin.defaultExcludes, [serverlessConfigFileName])
        )
      );
    });

    it('should not exclude plugins localPath if it is not a string', () => {
      const localPath = {};
      serverless.service.plugins = { localPath };

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(
          _.union(packagePlugin.defaultExcludes, [serverlessConfigFileName])
        )
      );
    });

    it('should not exclude serverlessConfigFilePath if is not found', () => {
      getServerlessConfigFilePathStub.returns(BbPromise.resolve(null));

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(packagePlugin.defaultExcludes)
      );
    });

    it('should merge defaults with plugin localPath and excludes', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      const packageExcludes = ['dir', 'file.js'];
      serverless.service.package.exclude = packageExcludes;

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(
          _.union(
            packagePlugin.defaultExcludes,
            [serverlessConfigFileName],
            [localPath],
            packageExcludes
          )
        )
      );
    });

    it('should merge defaults with plugin localPath package and func excludes', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      const packageExcludes = ['dir', 'file.js'];
      serverless.service.package.exclude = packageExcludes;

      const funcExcludes = ['lib', 'other.js'];

      return expect(packagePlugin.getExcludes(funcExcludes)).to.be.fulfilled.then(exclude =>
        expect(exclude).to.deep.equal(
          _.union(
            packagePlugin.defaultExcludes,
            [serverlessConfigFileName],
            [localPath],
            packageExcludes,
            funcExcludes
          )
        )
      );
    });
  });

  describe('#packageService()', () => {
    it('should package all functions', () => {
      serverless.service.package.individually = false;

      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves();

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(
        () => expect(packageAllStub).to.be.calledOnce
      );
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
        .stub(packagePlugin, 'packageFunction')
        .resolves(func => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(
        () => expect(packageFunctionStub).to.be.calledTwice
      );
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
        .stub(packagePlugin, 'packageFunction')
        .resolves(func => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves(func => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledOnce,
          expect(packageAllStub).to.be.calledOnce
        )
      );
    });

    it('should not package functions if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';

      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves();

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(
        () => expect(packageAllStub).to.not.be.called
      );
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
        .stub(packagePlugin, 'packageFunction')
        .resolves(func => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves(func => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledTwice,
          expect(packageAllStub).to.not.be.called
        )
      );
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
        .stub(packagePlugin, 'packageFunction')
        .resolves(func => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves(func => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledOnce,
          expect(packageAllStub).to.not.be.called
        )
      );
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
        .stub(packagePlugin, 'getExcludes')
        .returns(BbPromise.resolve(exclude));
      getIncludesStub = sinon.stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns')
        .returns(files);
      zipFilesStub = sinon.stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
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

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.all([
          expect(getExcludesStub).to.be.calledOnce,
          expect(getIncludesStub).to.be.calledOnce,
          expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
          expect(zipFilesStub).to.be.calledOnce,
          expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, []),
        ])
      );
    });

    (process.platfrom === 'win32' ? it : it.skip)(
      'should call zipService with settings & binaries to chmod for GoLang on win32',
      () => {
        const servicePath = 'test';
        const zipFileName = `${serverless.service.service}.zip`;

        serverless.config.servicePath = servicePath;
        serverless.service.provider.runtime = 'go1.x';

        return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, [
              'foo',
            ]),
          ])
        );
      }
    );

    (process.platfrom === 'win32' ? it : it.skip)(
      'should call zipService with settings & no binaries to chmod for non-go on win32',
      () => {
        const servicePath = 'test';
        const zipFileName = `${serverless.service.service}.zip`;

        serverless.config.servicePath = servicePath;

        return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, []),
          ])
        );
      }
    );

    (process.platfrom === 'win32' ? it : it.skip)(
      'should normalize the handler path for go runtimes on win32',
      () => {
        serverless.service.functions.first.handler = 'foo/bar//foo\\bar\\\\foo';
        serverless.service.provider.runtime = 'go1.x';

        const servicePath = 'test';
        const zipFileName = `${serverless.service.service}.zip`;

        serverless.config.servicePath = servicePath;

        return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(serverless.service.functions.first),
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, [
              path.normalize(serverless.service.functions.first.handler),
            ]),
          ])
        );
      }
    );
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
        .stub(packagePlugin, 'getExcludes')
        .returns(BbPromise.resolve(exclude));
      getIncludesStub = sinon.stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns')
        .returns(files);
      zipFilesStub = sinon.stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
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

      return expect(packagePlugin.packageFunction(funcName))
        .to.eventually.equal(artifactFilePath)
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,

            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, []),
          ])
        );
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

      return expect(packagePlugin.packageFunction(funcName))
        .to.eventually.equal(path.join('test/artifact.zip'))
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.not.have.been.called,
            expect(getIncludesStub).to.not.have.been.called,
            expect(zipFilesStub).to.not.have.been.called,
          ])
        );
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

      return expect(packagePlugin.packageFunction(funcName))
        .to.eventually.equal(path.join('test/artifact.zip'))
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.not.have.been.called,
            expect(getIncludesStub).to.not.have.been.called,
            expect(zipFilesStub).to.not.have.been.called,
          ])
        );
    });

    it('should call zipService with settings if packaging individually without artifact', () => {
      const servicePath = 'test';
      const funcName = 'test-func';

      const zipFileName = 'test-func.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.functions = {};
      serverless.service.package = {
        artifact: 'artifact.zip',
      };
      serverless.service.functions[funcName] = {
        name: `test-proj-${funcName}`,
        package: { individually: true },
      };

      return expect(packagePlugin.packageFunction(funcName))
        .to.eventually.equal(artifactFilePath)
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,

            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, undefined, []),
          ])
        );
    });

    it('should not override package property', () => {
      const funcName = 'test-func';
      serverless.service.functions = {};
      serverless.service.functions[funcName] = {
        name: `test-proj-${funcName}`,
        package: { individually: true },
      };

      return packagePlugin
        .packageFunction(funcName)
        .then(() =>
          BbPromise.all([
            expect(serverless.service.functions[funcName].package.individually).to.equal(true),
          ])
        );
    });
  });

  describe('#packageLayer()', () => {
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
        .stub(packagePlugin, 'getExcludes')
        .returns(BbPromise.resolve(exclude));
      getIncludesStub = sinon.stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns')
        .returns(files);
      zipFilesStub = sinon.stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
    });

    afterEach(() => {
      packagePlugin.getExcludes.restore();
      packagePlugin.getIncludes.restore();
      packagePlugin.resolveFilePathsFromPatterns.restore();
      packagePlugin.zipFiles.restore();
    });

    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const layerName = 'test-layer';

      const zipFileName = 'test-layer.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.layers = {};
      serverless.service.layers[layerName] = { path: './foobar' };

      return expect(packagePlugin.packageLayer(layerName))
        .to.eventually.equal(artifactFilePath)
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,

            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(
              files,
              zipFileName,
              path.resolve('./foobar')
            ),
          ])
        );
    });
  });

  describe('#resolveFilePathsFromPatterns()', () => {
    // NOTE: the path.join in `beforeEach` will take care of OS
    // independent file paths
    const handlerFile = 'src/function/handler.js';
    const utilsFile = 'src/utils/utils.js';
    let servicePath;

    beforeEach(() => {
      servicePath = createTmpDir();
      fse.ensureFileSync(path.join(servicePath, handlerFile));
      fse.ensureFileSync(path.join(servicePath, utilsFile));
    });

    it('should exclude all and include function/handler.js', () => {
      const params = {
        exclude: ['**'],
        include: [handlerFile],
      };
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then(actual => expect(actual).to.deep.equal([handlerFile]));
    });

    it('should include file specified with `!` in exclude params', () => {
      const params = {
        exclude: ['**', `!${utilsFile}`],
        include: [handlerFile],
      };
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then(actual => expect(actual).to.deep.equal([handlerFile, utilsFile]));
    });

    it('should exclude file specified with `!` in include params', () => {
      const params = {
        exclude: [],
        include: [`!${utilsFile}`],
      };
      const expected = [handlerFile];
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then(actual => expect(actual).to.deep.equal(expected));
    });
  });
});
