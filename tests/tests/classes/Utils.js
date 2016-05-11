'use strict';

/**
 * Test: Utils Function Class
 */

const path = require('path');
const os = require('os');
const assert = require('chai').assert;
const expect = require('chai').expect;
const Utils = require('../../../lib/classes/Utils')({});

const SUtils = new Utils();

describe('Utils class tests', () => {

  after((done) => {
    done();
  });

  it('should export an object', () => {
    const data = {
      _class: 'SampleClass',
      publicProp: 'somethingPublic',
      functionProp: () => {
      }
    };

    const Obj = SUtils.exportObject(data);
    assert.equal(Obj.publicProp, 'somethingPublic');
    assert.equal(typeof Obj._class, 'undefined');
    assert.equal(typeof Obj.functionProp, 'undefined');
  });

  it('should generate a shortId', () => {
    const id = SUtils.generateShortId(6);
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 6);
  });

  it('should check if a directory exists synchronously', () => {
    const dir = SUtils.dirExistsSync(__dirname);
    const noDir = SUtils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));

    assert.equal(dir, true);
    assert.equal(noDir, false);
  });

  it('should check if a file exists synchronously', () => {
    const file = SUtils.fileExistsSync(__filename);
    const noFile = SUtils.fileExistsSync(path.join(__dirname, 'XYZ.json'));

    assert.equal(file, true);
    assert.equal(noFile, false);
  });

  it('should write a file synchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
    let obj = SUtils.readFileSync(tmpFilePath);

    assert.equal(obj.foo, 'bar');
  });

  it('should write a file asynchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return SUtils.writeFile(tmpFilePath, { foo: 'bar' }).then(() => {
      let obj = SUtils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });
  });

  it('should read a file synchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
    let obj = SUtils.readFileSync(tmpFilePath);

    assert.equal(obj.foo, 'bar');
  });

  it('should read a file asynchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return SUtils.readFile(tmpFilePath).then((obj) => {
      expect(obj.foo).to.equal('bar');
    });
  });

});
