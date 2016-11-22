'use strict';

const expect = require('chai').expect;
const testUtils = require('./index');

describe('Test utils', () => {
  describe('#getTmpDirPath()', () => {
    it('should return a valid tmpDir path', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

      expect(tmpDirPath).to.match(/.+.{16}/);
    });
  });

  describe('#getTmpFilePath()', () => {
    it('should return a valid tmpFile path', () => {
      const fileName = 'foo.bar';
      const tmpFilePath = testUtils.getTmpFilePath(fileName);

      expect(tmpFilePath).to.match(/.+.{16}.{1}foo\.bar/);
    });
  });
});
