'use strict';

const { expect } = require('chai');

const resolveProviderName = require('../../../../lib/configuration/resolve-provider-name');
const ServerlessError = require('../../../../lib/serverless-error');

describe('test/unit/lib/configuration/resolve-provider-name.test.js', () => {
  it('should read name from "provider"', () => {
    expect(resolveProviderName({ provider: 'foo' })).to.equal('foo');
  });
  it('should read name from "provider.name"', () => {
    expect(resolveProviderName({ provider: { name: 'foo' } })).to.equal('foo');
  });
  it('should reject missing "provider.name"', () => {
    expect(() => resolveProviderName({ provider: {} }))
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_CONFIGURATION_PROVIDER_NAME_MISSING');
  });
  it('should reject invalid "provider.name"', () => {
    expect(() => resolveProviderName({ provider: { name: {} } }))
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_CONFIGURATION_PROVIDER_NAME_MISSING');
  });
  it('should reject missing "provider"', () => {
    expect(() => resolveProviderName({}))
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_CONFIGURATION_PROVIDER_NAME_MISSING');
  });
});
