'use strict';

const expect = require('chai').expect;
const PlatformPlugin = require('./platform');
const Serverless = require('../../Serverless');

describe('platform', () => {
  let serverless;
  let plugin;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    plugin = new PlatformPlugin(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(plugin.serverless).to.deep.equal(serverless);
    });

    it('should have a hook after the deploy', () => {
      expect(plugin.hooks).to.have.property('after:deploy:deploy');
    });
  });
});
