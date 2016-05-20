'use strict';

const path = require('path');
const os = require('os');
const expect = require('chai').expect;
const Serverless = require('../../../lib/Serverless');
const Utils = require('../../../lib/classes/Utils');
const YamlParser = require('../../../lib/classes/YamlParser');

const S = new Serverless();
const SUtils = new Utils(S);
const yamlParser = new YamlParser(S);

describe('Utils', () => {
  describe('#generateShortId()', () => {
    it('should generate a shortId', () => {
      const id = SUtils.generateShortId();
      expect(id).to.be.a('string');
    });

    it('should generate a shortId for the given length', () => {
      const id = SUtils.generateShortId(6);
      expect(id.length).to.be.equal(6);
    });
  });

  describe('#dirExistsSync()', () => {
    describe('When reading a directory', () => {
      it('should detect if a directory exists', () => {
        const dir = SUtils.dirExistsSync(__dirname);
        expect(dir).to.equal(true);
      });

      it('should detect if a directory doesn\'t exist', () => {
        const noDir = SUtils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));
        expect(noDir).to.equal(false);
      });
    });
  });

  describe('#fileExistsSync()', () => {
    describe('When reading a file', () => {
      it('should detect if a file exists', () => {
        const file = SUtils.fileExistsSync(__filename);
        expect(file).to.equal(true);
      });

      it('should detect if a file doesn\'t exist', () => {
        const noFile = SUtils.fileExistsSync(path.join(__dirname, 'XYZ.json'));
        expect(noFile).to.equal(false);
      });
    });
  });

  describe('#writeFileSync()', () => {
    it('should write a .json file synchronously', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

      SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = SUtils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should write a .yaml file synchronously', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.yaml');

      SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => { SUtils.writeFileSync(null); }).to.throw(Error);
    });
  });

  describe('#writeFile()', () => {
    it('should write a file asynchronously', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return SUtils.writeFile(tmpFilePath, { foo: 'bar' }).then(() => {
        const obj = SUtils.readFileSync(tmpFilePath);

        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#readFileSync()', () => {
    it('should read a file synchronously', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

      SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = SUtils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });
  });

  describe('#readFile()', () => {
    it('should read a file asynchronously', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

      SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return SUtils.readFile(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });
  });
});

