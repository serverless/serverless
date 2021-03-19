'use strict';

const { expect } = require('chai');

const resolveProviderName = require('../../../../lib/configuration/resolve-provider-name');

describe('test/unit/lib/configuration/resolve-provider.name.test.js', () => {
  it('should read name from "provider"', () => {
    expect(resolveProviderName({ provider: 'foo' })).to.equal('foo');
  });
  it('should read name from "provider.name"', () => {
    expect(resolveProviderName({ provider: { name: 'foo' } })).to.equal('foo');
  });
  it('should reject missing "provider.name"', () => {
    expect(() => resolveProviderName({ provider: {} })).to.throw('Invalid service configuration');
  });
  it('should reject invalid "provider.name"', () => {
    expect(() => resolveProviderName({ provider: { name: {} } })).to.throw(
      'Invalid service configuration'
    );
  });
  it('should reject missing "provider"', () => {
    expect(() => resolveProviderName({})).to.throw('Invalid service configuration');
  });
});
