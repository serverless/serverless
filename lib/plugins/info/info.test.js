'use strict';

const expect = require('chai').expect;
const Info = require('./info');
const Serverless = require('../../Serverless');

describe('Info', () => {
  let info;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    info = new Info(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(info.commands).to.be.not.empty);
  });
});
