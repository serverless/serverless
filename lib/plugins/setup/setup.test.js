'use strict';

const expect = require('chai').expect;
const Setup = require('./setup');
const Serverless = require('../../Serverless');

describe('Setup', () => {
  let setup;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    setup = new Setup(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(setup.commands).to.be.not.empty);
  });

  describe('#setup()', () => {
    it('should throw error if user passed unsupported provider', () => {
      setup.options = { provider: 'blah' };
      expect(() => setup.setup()).to.throw(Error);
    });
  });
});
