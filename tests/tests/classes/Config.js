'use strict';

/**
 * Test: Config Class
 */

const expect = require('chai').expect;
const Config = require('../../../lib/classes/Config');
const Serverless = require('../../../lib/Serverless');

const S = new Serverless();

describe('Config', () => {

  after((done) => {
    done();
  });

  describe('#constructor()', () => {

    it('should attach serverless instance', () => {
      const configInstance = new Config(S);
      expect(typeof configInstance.S._version).to.be.equal('string');
    });

    it('should add config if provided', () => {
      const configInstance = new Config(S, { servicePath: 'string' });
      expect(configInstance.servicePath).to.be.equal('string');
    });
  });

  describe('#update()', () => {

    it('should update config', () => {
      const configInstance = new Config(S, { servicePath: 'config1' });
      expect(configInstance.servicePath).to.be.equal('config1');

      configInstance.update({ servicePath: 'config2' });
      expect(configInstance.servicePath).to.be.equal('config2');
    });
  });
});