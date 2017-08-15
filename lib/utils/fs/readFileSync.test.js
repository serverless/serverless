'use strict';

const testUtils = require('../../../tests/utils');
const expect = require('chai').expect;
const writeFileSync = require('./writeFileSync');
const readFileSync = require('./readFileSync');

describe('#readFileSync()', () => {
  it('should read a file synchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.json');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should read a filename extension .yml', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should read a filename extension .yaml', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should throw YAMLException with filename if yml file is invalid format', () => {
    const tmpFilePath = testUtils.getTmpFilePath('invalid.yml');

    writeFileSync(tmpFilePath, ': a');

    expect(() => {
      readFileSync(tmpFilePath);
    }).to.throw(new RegExp('YAMLException:.*invalid.yml'));
  });
});
