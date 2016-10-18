'use strict';

const expect = require('chai').expect;
const Rollback = require('../index');
const Serverless = require('../../../Serverless');

describe('Rollback', () => {
  let rollback;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    rollback = new Rollback(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(rollback.commands).to.be.not.empty);
  });
});
