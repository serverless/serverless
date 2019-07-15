'use strict';

const path = require('path');
const expect = require('chai').expect;
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
});
