'use strict';

const path = require('path');
const expect = require('chai').expect;
const fse = require('fs-extra');
const skipOnDisabledSymlinksInWindows = require('@serverless/test/skip-on-disabled-symlinks-in-windows');
const fileExistsSync = require('../../../../../lib/utils/fs/file-exists-sync');

describe('#fileExistsSync()', () => {
  describe('When reading a file', () => {
    it('should detect if a file exists', () => {
      const file = fileExistsSync(__filename);
      expect(file).to.equal(true);
    });

    it("should detect if a file doesn't exist", () => {
      const noFile = fileExistsSync(path.join(__dirname, 'XYZ.json'));
      expect(noFile).to.equal(false);
    });
  });

  describe('When reading a symlink to a file', () => {
    it('should detect if the file exists', function () {
      try {
        fse.symlinkSync(__filename, 'sym');
      } catch (error) {
        skipOnDisabledSymlinksInWindows(error, this);
        throw error;
      }
      const found = fileExistsSync('sym');
      expect(found).to.equal(true);
      fse.unlinkSync('sym');
    });

    it("should detect if the file doesn't exist w/ bad symlink", function () {
      try {
        fse.symlinkSync('oops', 'invalid-sym');
      } catch (error) {
        skipOnDisabledSymlinksInWindows(error, this);
        throw error;
      }
      const found = fileExistsSync('invalid-sym');
      expect(found).to.equal(false);
      fse.unlinkSync('invalid-sym');
    });

    it("should detect if the file doesn't exist w/ symlink to dir", function () {
      try {
        fse.symlinkSync(__dirname, 'dir-sym');
      } catch (error) {
        skipOnDisabledSymlinksInWindows(error, this);
        throw error;
      }
      const found = fileExistsSync('dir-sym');
      expect(found).to.equal(false);
      fse.unlinkSync('dir-sym');
    });

    it("should detect if the file doesn't exist", () => {
      const found = fileExistsSync('bogus');
      expect(found).to.equal(false);
    });
  });
});
