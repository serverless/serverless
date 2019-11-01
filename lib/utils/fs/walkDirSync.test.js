'use strict';

const fs = require('fs');
const path = require('path');
const writeFileSync = require('./writeFileSync');
const walkDirSync = require('./walkDirSync');
const { expect } = require('chai');
const { getTmpDirPath } = require('../../../tests/utils/fs');
const skipOnDisabledSymlinksInWindows = require('@serverless/test/skip-on-disabled-symlinks-in-windows');

describe('#walkDirSync()', () => {
  it('should return an array with corresponding paths to the found files', () => {
    const tmpDirPath = getTmpDirPath();

    const nestedDir1 = path.join(tmpDirPath, 'foo');
    const nestedDir2 = path.join(tmpDirPath, 'foo', 'bar');
    const nestedDir3 = path.join(tmpDirPath, 'baz');

    const tmpFilePath1 = path.join(nestedDir1, 'foo.js');
    const tmpFilePath2 = path.join(nestedDir2, 'bar.js');
    const tmpFilePath3 = path.join(nestedDir3, 'baz.js');

    writeFileSync(tmpFilePath1, 'foo');
    writeFileSync(tmpFilePath2, 'bar');
    writeFileSync(tmpFilePath3, 'baz');

    const filePaths = walkDirSync(tmpDirPath);

    expect(filePaths).to.include(tmpFilePath1);
    expect(filePaths).to.include(tmpFilePath2);
    expect(filePaths).to.include(tmpFilePath3);
  });

  it('should check noLinks option', function() {
    const tmpDirPath = getTmpDirPath();

    const realFile = path.join(tmpDirPath, 'real');
    writeFileSync(realFile, 'content');

    const symLink = path.join(tmpDirPath, 'sym');
    try {
      fs.symlinkSync(realFile, symLink);
    } catch (error) {
      skipOnDisabledSymlinksInWindows(error, this);
      throw error;
    }

    const filePaths = walkDirSync(tmpDirPath, {
      noLinks: true,
    });

    expect(filePaths).to.include(realFile);
    expect(filePaths).not.to.include(symLink);
  });
});
