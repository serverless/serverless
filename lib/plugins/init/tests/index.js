'use strict';

const expect = require('chai').expect;
const Init = require('../index.js');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

describe('Init', () => {
  let init;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    init = new Init(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(init.commands).to.be.not.empty);
  });

  describe('#init()', () => {
    it('should throw error if user passed unsupported provider', () => {
      init.options = { provider: 'blah' };
      expect(() => init.init()).to.throw(Error);
    });
  });
});
