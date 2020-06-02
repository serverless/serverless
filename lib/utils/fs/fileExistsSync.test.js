'use strict';

const path = require('path');
const expect = require('chai').expect;
const fse = require('fs-extra');
const fileExistsSync = require('./fileExistsSync');

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
    it('should detect if the file exists', () => {
      fse.symlinkSync(__filename, 'sym');
      const found = fileExistsSync('sym');
      expect(found).to.equal(true);
      fse.unlinkSync('sym');
    });

    it("should detect if the file doesn't exist w/ bad symlink", () => {
      fse.symlinkSync('oops', 'invalid-sym');
      const found = fileExistsSync('invalid-sym');
      expect(found).to.equal(false);
      fse.unlinkSync('invalid-sym');
    });

    it("should detect if the file doesn't exist w/ symlink to dir", () => {
      fse.symlinkSync(__dirname, 'dir-sym');
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
