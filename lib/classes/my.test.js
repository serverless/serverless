'use strict';


const BbPromise = require('bluebird');
const chai = require('chai');

const expect = chai.expect;

describe.only('Variables', function variables() {
  it.only('simpler', () => {
    return expect(BbPromise.reduce([
      Promise.resolve('foo'),
      Promise.resolve('bar'),
      Promise.reject('reason')
    ])).to.be.rejected
  })
});
