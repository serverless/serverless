'use strict';

/**
 * Test: HelloWorld Plugin
 */

const expect = require('chai').expect;
const Create = require('../create');
const Serverless = require('../../../Serverless')
const S = new Serverless();

describe('Create', () => {
  let create;

  before(() => {
    create = new Create(S);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(create.commands).to.be.not.empty);

    it('should have hooks', () => expect(create.hooks).to.be.not.empty);
  });

  describe('#create()', () => {
    it('should print "Hello"', () => {
      create.hooks['create:create']().then(() => {
        // asserts
      });
    });
  });
});
