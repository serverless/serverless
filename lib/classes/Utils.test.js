'use strict';

const path = require('path');
const os = require('os');
const chai = require('chai');
const sinon = require('sinon');
const fse = require('fs-extra');
const Serverless = require('../../lib/Serverless');
const configUtils = require('@serverless/utils/config');
const Utils = require('../../lib/classes/Utils');
const { expect } = require('chai');
const { getTmpFilePath, getTmpDirPath } = require('../../test/utils/fs');

chai.use(require('chai-as-promised'));

describe('Utils', () => {
  let utils;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    utils = new Utils(serverless);
  });

  describe('#getTmpDirPath()', () => {
    it('should create a scoped tmp directory', () => {
      const dirPath = serverless.utils.getTmpDirPath();
      const stats = fse.statSync(dirPath);
      expect(dirPath).to.include('tmpdirs-serverless');
      expect(stats.isDirectory()).to.equal(true);
    });
  });

  describe('#dirExistsSync()', () => {
    describe('When reading a directory', () => {
      it('should detect if a directory exists', () => {
        const dir = serverless.utils.dirExistsSync(__dirname);
        expect(dir).to.equal(true);
      });

      it("should detect if a directory doesn't exist", () => {
        const noDir = serverless.utils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));
        expect(noDir).to.equal(false);
      });
    });
  });

  describe('#fileExistsSync()', () => {
    describe('When reading a file', () => {
      it('should detect if a file exists', () => {
        const file = serverless.utils.fileExistsSync(__filename);
        expect(file).to.equal(true);
      });

      it("should detect if a file doesn't exist", () => {
        const noFile = serverless.utils.fileExistsSync(path.join(__dirname, 'XYZ.json'));
        expect(noFile).to.equal(false);
      });
    });
  });

  describe('#writeFileDir()', () => {
    it('should create a directory for the path of the given file', () => {
      const tmpDirPath = getTmpDirPath();
      const fileDir = path.join(tmpDirPath, 'foo', 'bar');
      serverless.utils.writeFileDir(path.join(fileDir, 'somefile.js'));
      expect(serverless.utils.dirExistsSync(fileDir)).to.equal(true);
      // it should only create the directories and not the file
      expect(serverless.utils.fileExistsSync(path.join(fileDir, 'somefile.js'))).to.equal(false);
    });
  });

  describe('#writeFileSync()', () => {
    it('should write a .json file synchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should write a .yml file synchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.yml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return expect(serverless.yamlParser.parse(tmpFilePath)).to.be.fulfilled.then(obj => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should write a .yaml file synchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.yaml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return expect(serverless.yamlParser.parse(tmpFilePath)).to.be.fulfilled.then(obj => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => {
        serverless.utils.writeFileSync(null);
      }).to.throw(Error);
    });
  });

  describe('#writeFile()', () => {
    it('should write a file asynchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.json');

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return expect(serverless.utils.writeFile(tmpFilePath, { foo: 'bar' })).to.be.fulfilled.then(
        () => {
          const obj = serverless.utils.readFileSync(tmpFilePath);

          expect(obj.foo).to.equal('bar');
        }
      );
    });
  });

  describe('#appendFileSync()', () => {
    it('should append a line to a text file', () => {
      const tmpFilePath = getTmpFilePath('appendedfile.txt');

      serverless.utils.writeFileSync(tmpFilePath, `line 1 ${os.EOL}`);
      serverless.utils.appendFileSync(tmpFilePath, 'line 2');

      const data = serverless.utils.readFileSync(tmpFilePath);
      expect(data.indexOf('line 1')).to.be.greaterThan(-1);
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => {
        serverless.utils.readFileSync(null);
      }).to.throw(Error);
    });
  });

  describe('#readFileSync()', () => {
    it('should read a file synchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should read a filename extension .yml', () => {
      const tmpFilePath = getTmpFilePath('anything.yml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should read a filename extension .yaml', () => {
      const tmpFilePath = getTmpFilePath('anything.yaml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should throw YAMLException with filename if yml file is invalid format', () => {
      const tmpFilePath = getTmpFilePath('invalid.yml');

      serverless.utils.writeFileSync(tmpFilePath, ': a');

      expect(() => {
        serverless.utils.readFileSync(tmpFilePath);
      }).to.throw(/.*invalid.yml/);
    });
  });

  describe('#readFile()', () => {
    it('should read a file asynchronously', () => {
      const tmpFilePath = getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return expect(serverless.utils.readFile(tmpFilePath)).to.be.fulfilled.then(obj => {
        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#walkDirSync()', () => {
    it('should return an array with corresponding paths to the found files', () => {
      const tmpDirPath = getTmpDirPath();

      const nestedDir1 = path.join(tmpDirPath, 'foo');
      const nestedDir2 = path.join(tmpDirPath, 'foo', 'bar');
      const nestedDir3 = path.join(tmpDirPath, 'baz');

      const tmpFilePath1 = path.join(nestedDir1, 'foo.js');
      const tmpFilePath2 = path.join(nestedDir2, 'bar.js');
      const tmpFilePath3 = path.join(nestedDir3, 'baz.js');

      serverless.utils.writeFileSync(tmpFilePath1, 'foo');
      serverless.utils.writeFileSync(tmpFilePath2, 'bar');
      serverless.utils.writeFileSync(tmpFilePath3, 'baz');

      const filePaths = serverless.utils.walkDirSync(tmpDirPath);

      expect(filePaths).to.include(tmpFilePath1);
      expect(filePaths).to.include(tmpFilePath2);
      expect(filePaths).to.include(tmpFilePath3);
    });
  });

  describe('#copyDirContentsSync()', () => {
    it('should recursively copy directory files', () => {
      const tmpSrcDirPath = path.join(process.cwd(), 'testSrc');
      const tmpDestDirPath = path.join(process.cwd(), 'testDest');

      const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt');
      const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt');
      const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'folder', 'file3.txt');

      const destFile1 = path.join(tmpDestDirPath, 'file1.txt');
      const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt');
      const destFile3 = path.join(tmpDestDirPath, 'folder', 'folder', 'file3.txt');

      serverless.utils.writeFileSync(srcFile1, 'foo');
      serverless.utils.writeFileSync(srcFile2, 'foo');
      serverless.utils.writeFileSync(srcFile3, 'foo');

      serverless.utils.copyDirContentsSync(tmpSrcDirPath, tmpDestDirPath);

      expect(serverless.utils.fileExistsSync(destFile1)).to.equal(true);
      expect(serverless.utils.fileExistsSync(destFile2)).to.equal(true);
      expect(serverless.utils.fileExistsSync(destFile3)).to.equal(true);
      fse.removeSync(tmpSrcDirPath);
      fse.removeSync(tmpDestDirPath);
    });
  });

  describe('#generateShortId()', () => {
    it('should generate a shortId', () => {
      const id = serverless.utils.generateShortId();
      expect(id).to.be.a('string');
    });

    it('should generate a shortId for the given length', () => {
      const id = serverless.utils.generateShortId(6);
      expect(id.length).to.be.equal(6);
    });
  });

  describe('#findServicePath()', () => {
    const testDir = process.cwd();

    it('should detect if the CWD is a service directory when using Serverless .yaml files', () => {
      const tmpDirPath = getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yaml');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .yml files', () => {
      const tmpDirPath = getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yml');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .json files', () => {
      const tmpDirPath = getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.json');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .js files', () => {
      const tmpDirPath = getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.js');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .ts files', () => {
      const tmpDirPath = getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.ts');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is not a service directory', () => {
      // just use the root of the tmpdir because findServicePath will
      // also check parent directories (and may find matching tmp dirs
      // from old tests)
      const tmpDirPath = os.tmpdir();
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.equal(null);
    });

    afterEach(() => {
      // always switch back to the test directory
      // so that we have a clean state
      process.chdir(testDir);
    });
  });

  describe('#getLocalAccessKey()', () => {
    let getConfigStub;
    let getGlobalConfigStub;

    beforeEach(() => {
      getConfigStub = sinon.stub(configUtils, 'getConfig');
      getGlobalConfigStub = sinon.stub(configUtils, 'getGlobalConfig');
    });

    afterEach(() => {
      configUtils.getConfig.restore();
      configUtils.getGlobalConfig.restore();
    });

    it('should return false if a user could not be found globally', () => {
      getConfigStub.returns({
        userId: 123456,
      });
      getGlobalConfigStub.returns({});

      const res = utils.getLocalAccessKey();

      expect(res).to.equal(false);
    });

    it('should return false if a user could be found globally but no locally', () => {
      getConfigStub.returns({});
      getGlobalConfigStub.returns({
        users: {
          123456: {
            dashboard: {
              accessKey: 'd45hb04rd4cc3ssk3y',
            },
          },
        },
      });

      const res = utils.getLocalAccessKey();
      expect(res).to.equal(false);
    });

    it('should return false if a user could be found but the dashboard config is missing', () => {
      getConfigStub.returns({ userId: 123456 });
      getGlobalConfigStub.returns({
        users: {
          123456: {},
        },
      });

      const res = utils.getLocalAccessKey();
      expect(res).to.equal(false);
    });

    it('should return false if a user could be found but the accessKey config is missing', () => {
      getConfigStub.returns({ userId: 123456 });
      getGlobalConfigStub.returns({
        users: {
          123456: {
            dashboard: {},
          },
        },
      });

      const res = utils.getLocalAccessKey();
      expect(res).to.equal(false);
    });

    it('should return the users dasboard access key if config can be found', () => {
      getConfigStub.returns({ userId: 123456 });
      getGlobalConfigStub.returns({
        users: {
          123456: {
            dashboard: {
              accessKey: 'd45hb04rd4cc3ssk3y',
            },
          },
        },
      });

      const res = utils.getLocalAccessKey();
      expect(res).to.equal('d45hb04rd4cc3ssk3y');
    });
  });

  describe('#isEventUsed()', () => {
    it('should return true if the event is used and false otherwise', () => {
      const functions = {
        create: {
          events: [
            {
              schedule: 'rate(5 minutes)',
            },
          ],
        },
      };

      expect(utils.isEventUsed(functions, 'schedule')).to.equal(true);
      expect(utils.isEventUsed(functions, 'http')).to.equal(false);
    });
  });
});
