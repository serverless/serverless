'use strict';

const path = require('path');
const chai = require('chai');
const readFileIfExists = require('./readFileIfExists');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#readFileIfExists()', () => {
  it('should resolve with file content if file exists', () => {
    const packageJsonFilePath = path.join(__dirname, '..', '..', '..', 'package.json');
    return readFileIfExists(packageJsonFilePath).then(content => {
      expect(content.name).to.equal('serverless');
    });
  });

  it('should resolve with false if file does not exist', () => expect(readFileIfExists(path
    .join(__dirname, 'XYZ.json'))).to.eventually.equal(false));
});
