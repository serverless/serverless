'use strict';

const expect = require('chai').expect;
const config = require('./index');

describe('Config', () => {
  it('should have CONFIG_FILE_PATH', () => {
    const configPath = config.CONFIG_FILE_PATH;
    expect(configPath).to.exist; // eslint-disable-line
  });

  describe('When using config.getConfig', () => {
    it('should have frameworkId', () => {
      const conf = config.getConfig();
      expect(conf).to.have.deep.property('frameworkId');
    });

    it('should have settings', () => {
      const conf = config.getConfig();
      expect(conf).to.have.deep.property('settings');
    });

    it('should have settings.trackingDisabled', () => {
      const conf = config.getConfig();
      expect(conf).to.have.deep.property('settings.trackingDisabled');
    });
  });

  describe('When using config.get', () => {
    it('should have frameworkId', () => {
      const frameworkId = config.get('frameworkId');
      expect(frameworkId).to.exist; // eslint-disable-line
    });
    it('should have not have a value that doesnt exist', () => {
      const doesntExist = config.get('frameworkIdzzzz');
      expect(doesntExist).to.not.exist; // eslint-disable-line
    });
  });

  describe('When using config.set', () => {
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
