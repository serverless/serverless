'use strict';

const path = require('path');
const os = require('os');
const expect = require('chai').expect;
const Serverless = require('../../lib/Serverless');
const testUtils = require('../../tests/utils');

const serverless = new Serverless();

describe('Utils', () => {
  describe('#dirExistsSync()', () => {
    describe('When reading a directory', () => {
      it('should detect if a directory exists', () => {
        const dir = serverless.utils.dirExistsSync(__dirname);
        expect(dir).to.equal(true);
      });

      it('should detect if a directory doesn\'t exist', () => {
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

      it('should detect if a file doesn\'t exist', () => {
        const noFile = serverless.utils.fileExistsSync(path.join(__dirname, 'XYZ.json'));
        expect(noFile).to.equal(false);
      });
    });
  });

  describe('#writeFileSync()', () => {
    it('should write a .json file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should write a .yml file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should write a .yaml file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => { serverless.utils.writeFileSync(null); }).to.throw(Error);
    });
  });

  describe('#writeFile()', () => {
    it('should write a file asynchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return serverless.utils.writeFile(tmpFilePath, { foo: 'bar' }).then(() => {
        const obj = serverless.utils.readFileSync(tmpFilePath);

        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#readFileSync()', () => {
    it('should read a file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });
  });

  describe('#readFile()', () => {
    it('should read a file asynchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return serverless.utils.readFile(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#walkDirSync()', () => {
    it('should return an array with corresponding paths to the found files', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

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
    it('recursively copy directory files', () => {
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
      const tmpDirPath = testUtils.getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yaml');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .yml files', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yml');

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
});

