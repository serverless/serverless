'use strict';

const chai = require('chai');
const Remove = require('../../../../lib/plugins/remove');
const Serverless = require('../../../../lib/Serverless');

const expect = chai.expect;

describe('Remove', () => {
  let remove;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    remove = new Remove(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(remove.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(remove.commands).to.be.not.empty);
  });
});
