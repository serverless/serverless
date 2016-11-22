'use strict';

const expect = require('chai').expect;
const Invoke = require('./invoke');
const Serverless = require('../../Serverless');

describe('Invoke', () => {
  let invoke;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    invoke = new Invoke(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(invoke.commands).to.be.not.empty);
  });
});
