'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const copyDirContentsSync = require('../../../../../lib/utils/fs/copy-dir-contents-sync');
const fileExistsSync = require('../../../../../lib/utils/fs/file-exists-sync');
const writeFileSync = require('../../../../../lib/utils/fs/write-file-sync');
const skipOnDisabledSymlinksInWindows = require('@serverless/test/skip-on-disabled-symlinks-in-windows');

describe('#copyDirContentsSync()', () => {
  const afterCallback = () => {
    fse.removeSync(path.join(process.cwd(), 'testSrc'));
    fse.removeSync(path.join(process.cwd(), 'testDest'));
  };
  afterEach(afterCallback);

  it('should recursively copy directory files including symbolic links', function () {
    const tmpSrcDirPath = path.join(process.cwd(), 'testSrc');
    const tmpDestDirPath = path.join(process.cwd(), 'testDest');

    const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt');
    const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt');
    const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'file3.txt');

    const destFile1 = path.join(tmpDestDirPath, 'file1.txt');
    const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt');
    const destFile3 = path.join(tmpDestDirPath, 'folder', 'file3.txt');

    writeFileSync(srcFile1, 'foo');
    writeFileSync(srcFile2, 'bar');
    try {
      fs.symlinkSync(srcFile2, srcFile3);
    } catch (error) {
      skipOnDisabledSymlinksInWindows(error, this, afterCallback);
      throw error;
    }

    copyDirContentsSync(tmpSrcDirPath, tmpDestDirPath);

    expect(fileExistsSync(destFile1)).to.equal(true);
    expect(fileExistsSync(destFile2)).to.equal(true);
    expect(fileExistsSync(destFile3)).to.equal(true);
  });

  it('should recursively copy directory files excluding symbolic links', function () {
    const tmpSrcDirPath = path.join(process.cwd(), 'testSrc');
    const tmpDestDirPath = path.join(process.cwd(), 'testDest');

    const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt');
    const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt');
    const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'file3.txt');

    const destFile1 = path.join(tmpDestDirPath, 'file1.txt');
    const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt');
    const destFile3 = path.join(tmpDestDirPath, 'folder', 'file3.txt');

    writeFileSync(srcFile1, 'foo');
    writeFileSync(srcFile2, 'bar');
    try {
      fs.symlinkSync(srcFile2, srcFile3);
    } catch (error) {
      skipOnDisabledSymlinksInWindows(error, this, afterCallback);
      throw error;
    }

    copyDirContentsSync(tmpSrcDirPath, tmpDestDirPath, {
      noLinks: true,
    });

    expect(fileExistsSync(destFile1)).to.equal(true);
    expect(fileExistsSync(destFile2)).to.equal(true);
    expect(fileExistsSync(destFile3)).to.equal(false);
  });
});
