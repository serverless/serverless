'use strict';

const expect = require('chai').expect;
const Serverless = require('../../Serverless');

describe('platform', () => {
  let slStats;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(slStats.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(slStats.commands).to.be.not.empty);

    it('should have hooks', () => expect(slStats.hooks).to.be.not.empty);
  });
});
