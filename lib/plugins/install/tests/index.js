'use strict';

const expect = require('chai').expect;
const Install = require('../index.js');
const Serverless = require('../../../Serverless');

describe('Install', () => {
  let install;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    install = new Install(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(install.commands).to.be.not.empty);
  });
});
