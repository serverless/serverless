'use strict';

const expect = require('chai').expect;
const Remove = require('./remove');
const Serverless = require('../../Serverless');

describe('Remove', () => {
  let remove;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    remove = new Remove(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(remove.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(remove.commands).to.be.not.empty);
  });
});
