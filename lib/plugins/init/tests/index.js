'use strict';

const expect = require('chai').expect;
const Init = require('../index.js');
const Serverless = require('../../../Serverless');

describe('Init', () => {
  let info;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    init = new Init(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(info.commands).to.be.not.empty);
  });
});
