'use strict';

const expect = require('chai').expect;
const Logs = require('./logs');
const Serverless = require('../../Serverless');

describe('Logs', () => {
  let logs;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    logs = new Logs(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(logs.commands).to.be.not.empty);
  });
});
