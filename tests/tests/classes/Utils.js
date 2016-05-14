'use strict';

/**
 * Test: Utils Function Class
 */

const path = require('path');
const os = require('os');
const expect = require('chai').expect;
const Utils = require('../../../lib/classes/Utils')({});
const YamlParser = require('../../../lib/classes/YamlParser')({});

const SUtils = new Utils();
const SYamlParser = new YamlParser();

describe('Utils', () => {

  describe('#exportObject()', () => {
    it('should export an object', () => {
      const data = {
        _class: 'SampleClass',
        publicProp: 'somethingPublic',
        functionProp: () => {
        },
      };

      const Obj = SUtils.exportObject(data);
      expect(Obj.publicProp).to.equal('somethingPublic');
      expect(Obj._class).to.be.an('undefined');
      expect(Obj.functionProp).to.be.an('undefined');
    });
  });

  describe('#generateShortId()', () => {
    it('should generate a shortId', () => {
      const id = SUtils.generateShortId(6);
      expect(id).to.be.a('string');
    });

    it('should generate a shortId for the given length', () => {
      const id = SUtils.generateShortId(6);
      expect(id.length).to.equal(6);
    });
  });

  describe('#dirExistsSync()', () => {
    it('should check if a directory exists synchronously', () => {
      const dir = SUtils.dirExistsSync(__dirname);
      const noDir = SUtils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));

      expect(dir).to.equal(true);
      expect(noDir).to.equal(false);
    });
  });

  describe('#fileExistsSync()', () => {
    it('should check if a file exists synchronously', () => {
      const file = SUtils.fileExistsSync(__filename);
      const noFile = SUtils.fileExistsSync(path.join(__dirname, 'XYZ.json'));

      expect(file).to.equal(true);
      expect(noFile).to.equal(false);
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

      return SYamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
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
