'use strict';

const chai = require('chai');
const writeFile = require('../../../../../lib/utils/fs/write-file');
const readFile = require('../../../../../lib/utils/fs/read-file');
const { getTmpFilePath } = require('../../../../utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#readFile()', () => {
  it('should read a file asynchronously', () => {
    const tmpFilePath = getTmpFilePath('anything.json');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should read a filename extension .yml', () => {
    const tmpFilePath = getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should read a filename extension .yaml', () => {
    const tmpFilePath = getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should throw YAMLException with filename if yml file is invalid format', () => {
    const tmpFilePath = getTmpFilePath('invalid.yml');
    return writeFile(tmpFilePath, ': a')
      .then(() => readFile(tmpFilePath))
      .catch((e) => {
        expect(e.name).to.equal('YAMLException');
        expect(e.message).to.match(new RegExp('.*invalid.yml'));
      });
  });
});
