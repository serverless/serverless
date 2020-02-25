'use strict';

const expect = require('chai').expect;
const ConfigSchemaHandler = require('./ConfigSchemaHandler');

describe('ConfigSchemaHandler', () => {
  describe('#constructor', () => {
    it('should have schema property', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      expect(configSchemaHandler.schema).to.be.instanceOf(Object);
    });
  });
});
