'use strict';

const testUtils = require('../../../tests/utils');
const expect = require('chai').expect;
const writeFile = require('./writeFile');
const readFile = require('./readFile');

describe('#readFile()', () => {
  it('should read a file asynchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.json');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => readFile(tmpFilePath)).to.eventually.deep.equal({ foo:'bar' });
  });

  it('should read a filename extension .yml', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => readFile(tmpFilePath)).to.eventually.deep.equal({ foo:'bar' });
  });

  it('should read a filename extension .yaml', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => readFile(tmpFilePath)).to.eventually.deep.equal({ foo:'bar' });
  });

  it('should throw YAMLException with filename if yml file is invalid format', () => {
    const tmpFilePath = testUtils.getTmpFilePath('invalid.yml');

    return writeFile(tmpFilePath,  ': a')
      .then(() => readFile(tmpFilePath)).to.eventually.throw(new RegExp('YAMLException:.*invalid.yml'));
  });
});
