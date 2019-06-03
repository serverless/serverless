'use strict';

const expect = require('chai').expect;
const writeFileSync = require('./writeFileSync');
const readFileSync = require('./readFileSync');
const { getTmpFilePath } = require('../../../tests/utils/fs');

describe('#readFileSync()', () => {
  it('should read a file synchronously', () => {
    const tmpFilePath = getTmpFilePath('anything.json');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should read a filename extension .yml', () => {
    const tmpFilePath = getTmpFilePath('anything.yml');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should read a filename extension .yaml', () => {
    const tmpFilePath = getTmpFilePath('anything.yaml');

    writeFileSync(tmpFilePath, { foo: 'bar' });
    const obj = readFileSync(tmpFilePath);

    expect(obj.foo).to.equal('bar');
  });

  it('should throw YAMLException with filename if yml file is invalid format', () => {
    const tmpFilePath = getTmpFilePath('invalid.yml');

    writeFileSync(tmpFilePath, ': a');

    expect(() => {
      readFileSync(tmpFilePath);
    }).to.throw(/.*invalid.yml/);
  });
});
