'use strict';

const path = require('path');
const chai = require('chai');
const readFileIfExists = require('./readFileIfExists');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#readFileIfExists()', () => {
  it('should resolve with file content if file exists', () => readFileIfExists(__filename)
    .then(content => {
      expect(content).to.not.equal(false);
      expect(content).to.not.equal(undefined);
      expect(typeof content).to.equal('string');
    }));

  it('should resolve with false if file does not exist', () => expect(readFileIfExists(path
    .join(__dirname, 'XYZ.json'))).to.eventually.equal(false));
});
