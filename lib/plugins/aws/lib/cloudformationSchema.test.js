'use strict';

const expect = require('chai').expect;

const cloudformationSchema = require('./cloudformationSchema');

describe('#cloudformationSchame()', () => {
  describe('#schema()', () => {
    it('should contain schema', () => {
      expect(Object.keys(cloudformationSchema.schema)).to.be.eql([
        'include',
        'implicit',
        'explicit',
        'compiledImplicit',
        'compiledExplicit',
        'compiledTypeMap',
      ]);
    });
  });
});
