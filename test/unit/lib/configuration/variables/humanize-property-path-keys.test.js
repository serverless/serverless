'use strict';

const { expect } = require('chai');

const humanizePropertyPathTokens = require('../../../../../lib/configuration/variables/humanize-property-path-keys');

describe('test/unit/lib/configuration/variables/humanize-property-path-tokens.test.js', () => {
  it('should resolve human frendly path string', () => {
    expect(humanizePropertyPathTokens(['foo'])).to.equal('foo');
    expect(humanizePropertyPathTokens(['foo', 'bar'])).to.equal('foo.bar');
    expect(humanizePropertyPathTokens(['foo', 'bar', '1'])).to.equal('foo.bar.1');
  });
});
