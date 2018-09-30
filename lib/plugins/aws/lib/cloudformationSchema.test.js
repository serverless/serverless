'use strict';

const expect = require('chai').expect;

const { schema } = require('./cloudformationSchema');

describe('#cloudformationSchame()', () => {
  describe('#schema()', () => {
    it('should contain schema', () => {
      expect(Object.keys(schema)).to.be.eql([
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
