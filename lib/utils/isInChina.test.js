'use strict';

const { expect } = require('chai');
const requireUncached = require('ncjsm/require-uncached');

describe('isInChina', () => {
  it('should return boolean', () => {
    expect(typeof require('./isInChina')).to.equal('boolean');
  });

  it('should support SLS_GEO_LOCATION', () => {
    process.env.SLS_GEO_LOCATION = 'cn';
    expect(requireUncached(require.resolve('./isInChina'), () => require('./isInChina'))).to.equal(
      true
    );
  });
});
