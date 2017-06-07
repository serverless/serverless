'use strict';

const path = require('path');
const expect = require('chai').expect;
const fileExists = require('./fileExists');

describe('#fileExists()', () => {
  describe('When reading a file', () => {
    it('should detect if a file exists', () => {
      return fileExists(__filename).to.eventually.equal(true);
    });

    it('should detect if a file doesn\'t exist', () => {
      return fileExists(path.join(__dirname, 'XYZ.json')).to.eventually.equal(false);
    });
  });
});
