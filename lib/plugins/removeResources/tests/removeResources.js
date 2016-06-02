'use strict';

const expect = require('chai').expect;
const RemoveResources = require('../removeResources');
const Serverless = require('../../../Serverless');

describe('removeResources', () => {
  let removeResources;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    removeResources = new RemoveResources(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(removeResources.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(removeResources.commands).to.be.not.empty);
  });
});
