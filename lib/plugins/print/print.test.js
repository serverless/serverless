'use strict';

const expect = require('chai').expect;
const Print = require('./print');
const Serverless = require('../../Serverless');

describe('Print', () => {
  let print;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    print = new Print(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(print.commands).to.be.not.empty);
  });
});
