'use strict';

const expect = require('chai').expect;
const Package = require('./package');
const Serverless = require('../../../lib/Serverless');

describe.only('Package', () => {
  describe('#constructor()', () => {
    let serverless;
    let options;
    let pkg;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.init();
      options = {
        stage: 'dev',
        region: 'us-east-1',
      };
      pkg = new Package(serverless, options);
    });

    it('should set the serverless instance', () => {
      expect(pkg.serverless).to.equal(serverless);
    });

    it('should set the options', () => {
      expect(pkg.options).to.equal(options);
    });

    it('should have commands', () => expect(pkg.commands).to.be.not.empty);
  });
});
