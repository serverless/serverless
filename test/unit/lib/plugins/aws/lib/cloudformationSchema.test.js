'use strict';

const expect = require('chai').expect;

const cloudformationSchema = require('../../../../../../lib/plugins/aws/lib/cloudformationSchema');

describe('#cloudformationSchame()', () => {
  describe('#schema()', () => {
    it('should contain schema', () => {
      expect(Object.keys(cloudformationSchema.schema)).to.be.eql([
        'implicit',
        'explicit',
        'compiledImplicit',
        'compiledExplicit',
        'compiledTypeMap',
      ]);
    });
  });
});
