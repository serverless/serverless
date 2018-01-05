'use strict';

const chai = require('chai');
const parse = require('./parse');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#parse()', () => {
  it('should reconstitute circular references', () => {
    const tmpFilePath = 'anything.json';
    const fileContents = '{"foo":{"$ref":"$"}}';

    const obj = parse(tmpFilePath, fileContents);

    expect(obj).to.equal(obj.foo);
  });
});
