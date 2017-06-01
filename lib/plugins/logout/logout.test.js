'use strict';

const expect = require('chai').expect;
const Logout = require('./logout');
const Serverless = require('../../Serverless');

describe('Logout', () => {
  let logout;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    logout = new Logout(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(logout.commands).to.be.not.empty);
  });
});
