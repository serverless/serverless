'use strict';

const expect = require('chai').expect;
const Deploy = require('./deploy');
const Serverless = require('../../Serverless');


describe('Deploy', () => {
  let deploy;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    deploy = new Deploy(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty);
  });
});
