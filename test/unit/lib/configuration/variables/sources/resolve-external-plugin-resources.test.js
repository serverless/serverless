'use strict';

const { expect } = require('chai');

const ServerlessError = require('../../../../../../lib/serverless-error');
const resolveExternalPluginSources = require('../../../../../../lib/configuration/variables/sources/resolve-external-plugin-sources');

describe('test/unit/lib/configuration/variables/sources/resolve-external-plugin-resources.test.js', () => {
  it('should resolve external plugin sources', () => {
    const sources = {};
    const fulfilledSources = new Set();
    const externalPlugins = [
      {
        configurationVariablesSources: {
          ext1: { resolve: () => {} },
          ext2: { resolve: () => {} },
        },
      },
      {
        configurationVariablesSources: {
          ext3: { resolve: () => {} },
        },
      },
    ];
    resolveExternalPluginSources({}, { sources, fulfilledSources }, new Set(externalPlugins));
    expect(sources).to.deep.equal({
      ...externalPlugins[0].configurationVariablesSources,
      ...externalPlugins[1].configurationVariablesSources,
    });
    expect(fulfilledSources).to.deep.equal(new Set(Object.keys(sources)));
  });

  it('should reject meaningfully invalid sources configuration', () => {
    expect(() =>
      resolveExternalPluginSources(
        {},
        { sources: {}, fulfilledSources: new Set() },
        new Set([
          {
            configurationVariablesSources: 'foo',
          },
        ])
      )
    )
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_VARIABLE_SOURCES_CONFIGURATION');

    expect(() =>
      resolveExternalPluginSources(
        {},
        { sources: { existing: { resolve: () => {} } }, fulfilledSources: new Set(['existing']) },
        new Set([
          {
            configurationVariablesSources: { existing: { resolve: () => {} } },
          },
        ])
      )
    )
      .to.throw(ServerlessError)
      .with.property('code', 'DUPLICATE_VARIABLE_SOURCE_CONFIGURATION');

    expect(() =>
      resolveExternalPluginSources(
        {},
        { sources: {}, fulfilledSources: new Set() },
        new Set([
          {
            configurationVariablesSources: { source: 'foo' },
          },
        ])
      )
    )
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_VARIABLE_SOURCE_CONFIGURATION');

    expect(() =>
      resolveExternalPluginSources(
        {},
        { sources: {}, fulfilledSources: new Set() },
        new Set([
          {
            configurationVariablesSources: { source: { resolve: 'foo ' } },
          },
        ])
      )
    )
      .to.throw(ServerlessError)
      .with.property('code', 'INVALID_VARIABLE_SOURCE_RESOLVER_CONFIGURATION');
  });
});
