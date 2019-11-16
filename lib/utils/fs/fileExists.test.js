'use strict';

const path = require('path');
const chai = require('chai');
const fileExists = require('./fileExists');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#fileExists()', () => {
  describe('When reading a file', () => {
    it('should detect if a file exists', () =>
      expect(fileExists(__filename)).to.eventually.equal(true));

    it("should detect if a file doesn't exist", () =>
      expect(fileExists(path.join(__dirname, 'XYZ.json'))).to.eventually.equal(false));
  });
});
