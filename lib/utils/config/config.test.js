'use strict';

const expect = require('chai').expect;
const config = require('./index');

describe.only('Config', () => {
  describe('When reading config', () => {
    it('should have slsConfigFilePath', () => {
      const configPath = config.slsConfigFilePath;
      expect(configPath).to.exist; // eslint-disable-line
    });

    it('should have frameworkId', () => {
      const conf = config.getConfig();
      expect(conf).to.have.deep.property('frameworkId');
    });

    // for future use
    // it('should have slsStats', () => {
    //   const conf = config.getConfig();
    //   expect(conf).to.have.deep.property('slsStats');
    // });
  });

  describe('When writing config', () => {
    it('should add new properties with "set"', () => {
      config.set('foo', true);
      const foo = config.get('foo');
      expect(foo).to.equal(true);
    });

    it('should delete properties with "delete"', () => {
      // cleanup foo
      config.delete('foo');
      const zaz = config.get('foo');
      expect(zaz).to.equal(undefined);
    });
  });
});
