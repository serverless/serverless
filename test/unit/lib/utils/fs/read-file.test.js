'use strict';

const chai = require('chai');
const writeFile = require('../../../../../lib/utils/fs/write-file');
const readFile = require('../../../../../lib/utils/fs/read-file');
const { getTmpFilePath } = require('../../../../utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#readFile()', () => {
  it('should read a file asynchronously', async () => {
    const tmpFilePath = getTmpFilePath('anything.json');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should read a filename extension .yml', async () => {
    const tmpFilePath = getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should read a filename extension .yaml', async () => {
    const tmpFilePath = getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should throw YAMLException with filename if yml file is invalid format', async () => {
    const tmpFilePath = getTmpFilePath('invalid.yml');
    return expect(writeFile(tmpFilePath, ': a').then(() => readFile(tmpFilePath)))
      .to.eventually.be.rejectedWith(/.*invalid.yml/)
      .and.have.property('name', 'YAMLException');
  });
});
