'use strict';

const path = require('path');
const chai = require('chai');
const createZipFile = require('./createZipFile');
const { createTmpFile, listZipFiles } = require('../../../tests/utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#createZipFile()', () => {
  it('should create a zip file with the source directory content', () => {
    const toZipFilePath = createTmpFile('foo.json');
    const zipFilePath = createTmpFile('package.zip');

    const srcDirPath = toZipFilePath
      .split(path.sep)
      .slice(0, -1)
      .join(path.sep);

    return createZipFile(srcDirPath, zipFilePath)
      .then(listZipFiles)
      .then(files => expect(files).to.deep.equal(['foo.json']));
  });
});
